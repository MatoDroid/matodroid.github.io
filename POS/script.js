// ==========================================================================
// Restaurant POS — klientská logika
// Dátový model zo servera:
//   menuData.tables      [{ number, name }]
//   menuData.categories  [{ id, name, priority }]
//   menuData.menuItems   [{ category, name, price }]
//   tableOrders          { [cisloStola]: { items: { [nazov]: {price, quantity, category} },
//                                          total, createdAt } }
// ==========================================================================

const BACKEND_URL = "https://matodroid.onrender.com";

let currentTable = null;
let tableOrders = {};
let menuData = null;
let activeCategory = null;
let searchTerm = "";
let saveTimeout = null;

// stav rozdeľovania účtu
let splitTarget = null;
let itemsToMove = {};

// ==========================================================================
// POMOCNÉ FUNKCIE
// ==========================================================================

function fmt(n) {
    return (Number(n) || 0).toFixed(2).replace(".", ",") + " €";
}

// slovenské skloňovanie: 1 položka / 2–4 položky / 5+ položiek
function plItems(n) {
    if (n === 1) return "1 položka";
    if (n >= 2 && n <= 4) return n + " položky";
    return n + " položiek";
}

function plMoved(n) {
    if (n === 1) return "1 položka presunutá";
    if (n >= 2 && n <= 4) return n + " položky presunuté";
    return n + " položiek presunutých";
}

function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

function toast(message) {
    const $t = $(`<div class="toast"></div>`).text(message);
    $("#toast-stack").append($t);
    requestAnimationFrame(() => $t.addClass("show"));
    setTimeout(() => {
        $t.removeClass("show");
        setTimeout(() => $t.remove(), 220);
    }, 1800);
}

function showModal(id) { $("#" + id).addClass("show"); }
function hideModal(id) { $("#" + id).removeClass("show"); }

// číslo stola používame ako kľúč – vždy ako reťazec, aby sa "3" a 3 nerozchádzali
function tableKey(n) { return String(n); }

function tableLabel(table) {
    return table.name && String(table.name).trim() ? table.name : `Stôl ${table.number}`;
}

function orderOf(tableNumber) {
    return tableOrders[tableKey(tableNumber)];
}

// súčet vždy prepočítame z položiek — pripočítavanie po centoch
// inak nazbiera chybu plávajúcej čiarky (napr. 14.799999999999999)
function recalcTotal(order) {
    if (!order) return;
    const cents = Object.values(order.items).reduce(
        (sum, i) => sum + Math.round(i.price * 100) * i.quantity, 0
    );
    order.total = cents / 100;
}

function elapsedLabel(order) {
    if (!order || !order.createdAt) return "Obsadený";
    const mins = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
    if (!isFinite(mins) || mins < 0) return "Obsadený";
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

// ==========================================================================
// NAČÍTANIE DÁT
// ==========================================================================

async function loadMenuData() {
    try {
        const response = await fetch(`${BACKEND_URL}/menu`, { method: "GET" });
        if (!response.ok) throw new Error("Chyba načítania menu");

        menuData = await response.json();
        menuData.tables = menuData.tables || [];
        menuData.categories = menuData.categories || [];
        menuData.menuItems = menuData.menuItems || [];

        // kategórie zoradíme podľa priority z admin menu
        menuData.categories.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

        if (!activeCategory && menuData.categories.length) {
            activeCategory = menuData.categories[0].id;
        }

        renderTables();
        renderCategories();
        renderMenuItems();
        updateOrderDisplay();
    } catch (error) {
        console.error("Chyba načítania údajov:", error);
        toast("Nepodarilo sa načítať menu zo servera.");
    }
}

async function loadOrdersFromBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/orders`, { method: "GET" });
        if (!response.ok) return;

        const data = (await response.json()) || {};

        // server posiela { empty: true } keď nie sú žiadne objednávky —
        // bez odfiltrovania by vznikol neplatný "stôl" s názvom empty
        delete data.empty;

        // preistotu zahodíme záznamy bez položiek
        tableOrders = Object.fromEntries(
            Object.entries(data).filter(
                ([, v]) => v && typeof v === "object" && Object.keys(v.items || {}).length > 0
            )
        );
    } catch (error) {
        console.error("Chyba načítania objednávok:", error);
    }
}

// ==========================================================================
// UKLADANIE
// ==========================================================================

function buildOrdersPayload() {
    const cleaned = Object.fromEntries(
        Object.entries(tableOrders).filter(
            ([, v]) => v && Object.keys(v.items || {}).length > 0
        )
    );
    return Object.keys(cleaned).length === 0 ? { empty: true } : cleaned;
}

async function pushOrders() {
    try {
        await fetch(`${BACKEND_URL}/orders`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildOrdersPayload()),
        });
    } catch (error) {
        console.error("Chyba ukladania:", error);
        toast("Objednávku sa nepodarilo uložiť.");
    }
}

// bežné zmeny sa zlučujú, platba a storno sa ukladajú okamžite
function saveOrders(options) {
    const immediate = options && options.immediate;
    if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }

    if (immediate) return pushOrders();
    saveTimeout = setTimeout(pushOrders, 2500);
}

// ==========================================================================
// VYKRESLENIE — STOLY
// ==========================================================================

function renderTables() {
    const $grid = $(".table-grid").empty();
    if (!menuData || !menuData.tables.length) {
        $grid.append(`<div class="empty-hint">Žiadne stoly.<br>Pridajte ich v admin menu.</div>`);
        return;
    }

    menuData.tables.forEach((table) => {
        const key = tableKey(table.number);
        const order = tableOrders[key];
        const hasOrder = !!order && Object.keys(order.items || {}).length > 0;
        const isActive = currentTable !== null && tableKey(currentTable) === key;

        const $btn = $(`
            <button class="table-button" type="button" data-table="${escapeHtml(table.number)}">
                <span class="dot ${hasOrder ? "dot-occ" : "dot-free"}"></span>
                <span class="info">
                    <span class="t-name">${escapeHtml(tableLabel(table))}</span>
                    <span class="t-meta">${hasOrder ? escapeHtml(elapsedLabel(order)) : "Voľný"}</span>
                </span>
                ${hasOrder ? `<span class="t-total mono">${fmt(order.total)}</span>` : ""}
            </button>
        `);

        if (isActive) $btn.addClass("active");
        $grid.append($btn);
    });
}

// staré volania ponechávame funkčné
function updateTableStyles() { renderTables(); }

// ==========================================================================
// VYKRESLENIE — KATEGÓRIE A POLOŽKY
// ==========================================================================

function renderCategories() {
    const $wrap = $(".menu-categories").empty();
    if (!menuData) return;

    menuData.categories.forEach((category) => {
        const $btn = $(`<button class="category-button" type="button"></button>`)
            .attr("data-category", category.id)
            .text(category.name || category.id);
        if (category.id === activeCategory) $btn.addClass("active");
        $wrap.append($btn);
    });
}

function countOnTicket(itemName) {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    if (!order || !order.items[itemName]) return 0;
    return order.items[itemName].quantity;
}

function renderMenuItems() {
    const $wrap = $(".menu-items").empty();
    if (!menuData) return;

    const term = searchTerm.trim().toLowerCase();
    const list = menuData.menuItems.filter((item) =>
        term ? String(item.name).toLowerCase().includes(term) : item.category === activeCategory
    );

    if (!list.length) {
        $wrap.append(`<div class="empty-hint">${term ? "Nič sa nenašlo." : "V tejto kategórii nie sú položky."}</div>`);
        return;
    }

    list.forEach((item) => {
        const onTicket = countOnTicket(item.name);
        $wrap.append(`
            <button class="menu-item" type="button"
                    data-category="${escapeHtml(item.category)}"
                    data-price="${escapeHtml(item.price)}"
                    data-name="${escapeHtml(item.name)}">
                ${onTicket > 0
                    ? `<span class="m-count mono">${onTicket}</span>`
                    : `<span class="m-add">+</span>`}
                <span class="m-name">${escapeHtml(item.name)}</span>
                <span class="m-price mono">${fmt(item.price)}</span>
            </button>
        `);
    });
}

// ==========================================================================
// VYKRESLENIE — ÚČET
// ==========================================================================

function getCategoryName(categoryId) {
    if (!menuData) return "Ostatné";
    const category = menuData.categories.find((c) => c.id === categoryId);
    return category ? (category.name || category.id) : "Ostatné";
}

function getCategoryRank(categoryId) {
    if (!menuData) return 99;
    const index = menuData.categories.findIndex((c) => c.id === categoryId);
    return index === -1 ? 99 : index;
}

// kategória položky — z objednávky, inak dohľadaná v menu
function categoryOfItem(itemName, itemData) {
    if (itemData && itemData.category) return itemData.category;
    if (menuData) {
        const found = menuData.menuItems.find((i) => i.name === itemName);
        if (found) return found.category;
    }
    return undefined;
}

function updateOrderDisplay() {
    const $items = $(".order-items").empty();
    const order = currentTable !== null ? orderOf(currentTable) : null;

    if (!order || !Object.keys(order.items).length) {
        $items.append(
            currentTable === null
                ? `<div class="empty-hint">Vyberte stôl.</div>`
                : `<div class="empty-hint">Zatiaľ žiadne položky.<br>Klepnite na jedlo v menu.</div>`
        );
        $(".total-section span:last").text(fmt(0));
        $("#ticket-count").text(plItems(0));
        updateActionButtons();
        updateMobileSummary();
        return;
    }

    const entries = Object.entries(order.items);

    // zoradenie podľa poradia kategórií z admin menu, potom abecedne
    entries.sort((a, b) => {
        const rankA = getCategoryRank(categoryOfItem(a[0], a[1]));
        const rankB = getCategoryRank(categoryOfItem(b[0], b[1]));
        if (rankA !== rankB) return rankA - rankB;
        return a[0].localeCompare(b[0], "sk");
    });

    let lastCategory = null;
    let count = 0;

    entries.forEach(([itemName, item]) => {
        const categoryId = categoryOfItem(itemName, item);
        if (categoryId !== lastCategory) {
            $items.append(`<div class="order-category-title">${escapeHtml(getCategoryName(categoryId))}</div>`);
            lastCategory = categoryId;
        }

        count += item.quantity;

        const $row = $(`
            <div class="order-item">
                <span class="item-quantity">${item.quantity}×</span>
                <span class="item-name">${escapeHtml(itemName)}</span>
                <span class="quantity-controls">
                    <button class="quantity-btn minus" type="button" aria-label="Menej">–</button>
                    <button class="quantity-btn plus" type="button" aria-label="Viac">+</button>
                </span>
                <span class="item-total mono">${fmt(item.price * item.quantity)}</span>
            </div>
        `);

        $row.find(".minus").on("click", () => updateItemQuantity(itemName, -1));
        $row.find(".plus").on("click", () => updateItemQuantity(itemName, 1));
        $items.append($row);
    });

    $(".total-section span:last").text(fmt(order.total));
    $("#ticket-count").text(plItems(count));
    updateActionButtons();
    updateMobileSummary();
}

function updateActionButtons() {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    const hasItems = !!order && Object.keys(order.items).length > 0;

    $(".pay-button").prop("disabled", !hasItems);
    $(".cancel-button").prop("disabled", !hasItems);
    $(".split-order-button").prop("disabled", !hasItems);
}

function orderItemCount(order) {
    if (!order) return 0;
    return Object.values(order.items).reduce((sum, i) => sum + i.quantity, 0);
}

function updateMobileSummary() {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    const count = orderItemCount(order);
    const onMenuPage = $("#pos-app").attr("data-page") === "menu";

    $("#mobile-bar-text").text(`${plItems(count)} · ${fmt(order ? order.total : 0)}`);
    $("#mobile-bar").prop("hidden", !(onMenuPage && count > 0));

    $("#nav-badge").text(count).prop("hidden", count === 0);
}

// ==========================================================================
// ZMENY OBJEDNÁVKY
// ==========================================================================

function addItemToOrder(itemName, itemPrice, categoryId) {
    const key = tableKey(currentTable);

    if (!tableOrders[key]) {
        tableOrders[key] = { items: {}, total: 0, createdAt: new Date().toISOString() };
    }

    const order = tableOrders[key];
    if (order.items[itemName]) {
        order.items[itemName].quantity += 1;
        order.items[itemName].category = categoryId;
    } else {
        order.items[itemName] = { price: itemPrice, quantity: 1, category: categoryId };
    }
    recalcTotal(order);

    saveOrders();
    renderTables();
    renderMenuItems();
    updateOrderDisplay();
    toast(`+1 ${itemName}`);
}

function updateItemQuantity(itemName, delta) {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    if (!order) return;

    const item = order.items[itemName];
    if (!item) return;

    const newQuantity = item.quantity + delta;
    if (newQuantity <= 0) {
        delete order.items[itemName];
    } else {
        item.quantity = newQuantity;
    }
    recalcTotal(order);

    if (Object.keys(order.items).length === 0) {
        delete tableOrders[tableKey(currentTable)];
    }

    saveOrders();
    renderTables();
    renderMenuItems();
    updateOrderDisplay();
}

// ==========================================================================
// PLATBA A STORNO
// ==========================================================================

async function payOrder() {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    if (!order) return;

    const table = currentTable;
    const totalAmount = order.total.toFixed(2);
    const paidOrder = {
        table: table,
        items: order.items,
        total: totalAmount,
        date: new Date().toISOString(),
    };

    try {
        showModal("loading-modal");

        const response = await fetch(`${BACKEND_URL}/orders/paid`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(paidOrder),
        });
        if (!response.ok) throw new Error("Chyba platby");

        delete tableOrders[tableKey(table)];
        await saveOrders({ immediate: true });

        renderTables();
        renderMenuItems();
        updateOrderDisplay();

        const qrResponse = await fetch(`${BACKEND_URL}/generate-qr?amount=${totalAmount}&table=${encodeURIComponent(table)}`);
        hideModal("loading-modal");

        if (qrResponse.ok) {
            $("#qr-code").attr("src", qrResponse.url);
            $("#qr-subtitle").text(`${tableTitle(table)} · ${fmt(totalAmount)}`);
            showModal("qr-modal");
        } else {
            toast("Objednávka zaplatená, QR kód sa nepodarilo načítať.");
            closeQrModal();
        }
    } catch (error) {
        console.error("Chyba pri platbe:", error);
        hideModal("loading-modal");
        toast("Chyba pri platbe. Skúste znova.");
    }
}

function cancelOrder() {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    if (!order) return;

    if (!confirm(`Naozaj zrušiť objednávku pre ${tableTitle(currentTable)}?`)) return;

    delete tableOrders[tableKey(currentTable)];
    saveOrders({ immediate: true });

    renderTables();
    renderMenuItems();
    updateOrderDisplay();
    toast("Objednávka zrušená.");
}

function tableTitle(tableNumber) {
    if (tableNumber === null || tableNumber === undefined) return "Stôl";
    const table = menuData && menuData.tables.find((t) => tableKey(t.number) === tableKey(tableNumber));
    return table ? tableLabel(table) : `Stôl ${tableNumber}`;
}

function closeQrModal() {
    hideModal("qr-modal");
    selectTable(null);
    goToPage("tables");
}

// ==========================================================================
// ROZDELENIE ÚČTU
// ==========================================================================

function movingSum() {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    if (!order) return 0;
    return Object.entries(itemsToMove).reduce(
        (sum, [name, qty]) => sum + (order.items[name] ? order.items[name].price * qty : 0), 0
    );
}

function movingCount() {
    return Object.values(itemsToMove).reduce((sum, q) => sum + q, 0);
}

function openSplitOrderModal() {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    if (!order) return;

    splitTarget = null;
    itemsToMove = {};

    $("#split-source").text(tableTitle(currentTable));
    renderSplitTargets();
    renderSplitItems();
    renderSplitFoot();
    showModal("split-order-modal");
}

function renderSplitTargets() {
    const $wrap = $(".target-table-buttons").empty();
    if (!menuData) return;

    const others = menuData.tables.filter((t) => tableKey(t.number) !== tableKey(currentTable));
    if (!others.length) {
        $wrap.append(`<div class="empty-hint">Nie je kam presúvať.</div>`);
        return;
    }

    others.forEach((table) => {
        const $btn = $(`<button class="target-table-button" type="button"></button>`)
            .attr("data-table", table.number)
            .text(tableLabel(table));
        if (splitTarget !== null && tableKey(splitTarget) === tableKey(table.number)) {
            $btn.addClass("active");
        }
        $wrap.append($btn);
    });
}

function renderSplitItems() {
    const $wrap = $(".split-items-list").empty();
    const order = currentTable !== null ? orderOf(currentTable) : null;
    if (!order) return;

    Object.entries(order.items).forEach(([itemName, item]) => {
        const moving = itemsToMove[itemName] || 0;
        const $row = $(`
            <div class="split-order-item${moving > 0 ? " is-moving" : ""}">
                <span class="nm">${escapeHtml(itemName)}
                    <span class="have">na účte ${item.quantity}× · ${fmt(item.price)}</span>
                </span>
                <span class="quantity-controls">
                    <button class="quantity-btn move-back-button" type="button" aria-label="Menej">–</button>
                    <span class="moving mono">${moving}</span>
                    <button class="quantity-btn move-item-button" type="button" aria-label="Viac">+</button>
                </span>
            </div>
        `);

        $row.find(".move-item-button").on("click", () => changeMoving(itemName, 1));
        $row.find(".move-back-button").on("click", () => changeMoving(itemName, -1));
        $wrap.append($row);
    });
}

function changeMoving(itemName, delta) {
    const order = currentTable !== null ? orderOf(currentTable) : null;
    if (!order || !order.items[itemName]) return;

    const max = order.items[itemName].quantity;
    const next = Math.min(max, Math.max(0, (itemsToMove[itemName] || 0) + delta));

    if (next === 0) delete itemsToMove[itemName];
    else itemsToMove[itemName] = next;

    renderSplitItems();
    renderSplitFoot();
}

function renderSplitFoot() {
    $("#split-sum").text(fmt(movingSum()));

    const ready = splitTarget !== null && movingCount() > 0;
    $(".confirm-split-button")
        .prop("disabled", !ready)
        .text(splitTarget !== null ? `Presunúť na ${tableTitle(splitTarget)}` : "Presunúť");
}

function confirmSplit() {
    const source = currentTable !== null ? orderOf(currentTable) : null;
    if (!source || splitTarget === null || movingCount() === 0) return;

    const targetKey = tableKey(splitTarget);
    if (!tableOrders[targetKey]) {
        tableOrders[targetKey] = { items: {}, total: 0, createdAt: new Date().toISOString() };
    }
    const target = tableOrders[targetKey];
    const count = movingCount();

    Object.entries(itemsToMove).forEach(([itemName, qty]) => {
        const item = source.items[itemName];
        if (!item) return;

        if (target.items[itemName]) {
            target.items[itemName].quantity += qty;
        } else {
            target.items[itemName] = { price: item.price, quantity: qty, category: item.category };
        }

        item.quantity -= qty;
        if (item.quantity <= 0) delete source.items[itemName];
    });

    recalcTotal(source);
    recalcTotal(target);

    if (Object.keys(source.items).length === 0) {
        delete tableOrders[tableKey(currentTable)];
    }

    const targetName = tableTitle(splitTarget);
    itemsToMove = {};
    splitTarget = null;

    saveOrders({ immediate: true });
    hideModal("split-order-modal");

    renderTables();
    renderMenuItems();
    updateOrderDisplay();
    toast(`${plMoved(count)} na ${targetName}`);
}

function cancelSplit() {
    itemsToMove = {};
    splitTarget = null;
    hideModal("split-order-modal");
}

// ==========================================================================
// VÝBER STOLA, NAVIGÁCIA, ODHLÁSENIE
// ==========================================================================

function selectTable(tableNumber) {
    currentTable = tableNumber;

    const title = tableNumber === null ? "Vyberte stôl" : tableTitle(tableNumber);
    $(".current-order .ticket-head h2").text(title);
    $("#menu-eyebrow").text(title);

    renderTables();
    renderMenuItems();
    updateOrderDisplay();
}

function goToPage(page) {
    $("#pos-app").attr("data-page", page);
    $("#mobile-nav button").removeClass("active")
        .filter(`[data-page="${page}"]`).addClass("active");
    updateMobileSummary();
}

function setSearchOpen(open) {
    $("#search-wrap").prop("hidden", !open);
    $("#search-toggle").toggleClass("is-on", open).attr("aria-expanded", String(open));

    if (open) {
        $("#search-input").trigger("focus");
    } else if (searchTerm) {
        searchTerm = "";
        $("#search-input").val("");
        renderMenuItems();
    }
}

function logout() {
    localStorage.removeItem("authToken");
    window.location.href = "/POS/login.html";
}

// ==========================================================================
// INICIALIZÁCIA
// ==========================================================================

$(document).ready(async function () {

    // --- výber stola ---
    $(document).on("click", ".table-button", function () {
        selectTable($(this).data("table"));
        goToPage("menu");   // na mobile rovno pokračujeme do menu
    });

    // --- kategórie ---
    $(document).on("click", ".category-button", function () {
        activeCategory = $(this).data("category");
        searchTerm = "";
        $("#search-input").val("");
        renderCategories();
        renderMenuItems();
    });

    // --- pridanie položky ---
    $(document).on("click", ".menu-item", function () {
        if (currentTable === null) {
            toast("Najprv vyberte stôl.");
            goToPage("tables");
            return;
        }
        addItemToOrder(
            $(this).data("name"),
            parseFloat($(this).data("price")),
            $(this).data("category")
        );
    });

    // --- hľadanie ---
    $("#search-toggle").on("click", function () {
        setSearchOpen($("#search-wrap").prop("hidden"));
    });
    $("#search-input").on("input", function () {
        searchTerm = $(this).val();
        renderMenuItems();
    }).on("keydown", function (e) {
        if (e.key === "Escape") setSearchOpen(false);
    });

    // --- akcie účtu ---
    $(".pay-button").on("click", payOrder);
    $(".cancel-button").on("click", cancelOrder);
    $(".split-order-button").on("click", openSplitOrderModal);
    $("#close-modal").on("click", closeQrModal);
    $(".logout-button").on("click", logout);

    // --- rozdelenie účtu ---
    $(document).on("click", ".target-table-button", function () {
        splitTarget = $(this).data("table");
        renderSplitTargets();
        renderSplitFoot();
    });
    $(".confirm-split-button").on("click", confirmSplit);
    $(".cancel-split-button").on("click", cancelSplit);

    // --- mobilná navigácia ---
    $("#mobile-nav button").on("click", function () {
        goToPage($(this).data("page"));
    });
    $("#mobile-bar").on("click", () => goToPage("ticket"));

    // --- štart ---
    showModal("loading-data-modal");
    await loadOrdersFromBackend();
    await loadMenuData();
    hideModal("loading-data-modal");
});
