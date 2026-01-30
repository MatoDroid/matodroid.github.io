// ==========================================
// GLOBÁLNE PREMENNÉ A NASTAVENIA
// ==========================================
let currentTable = null; 
let tableOrders = {}; 
let menuData = null; 
let itemsToMove = {}; 
let saveTimeout = null; 
let targetTable = null; 
const BACKEND_URL = "https://matodroid.onrender.com"; 

// --- DEFINÍCIA PRIORÍT (PRE ZORAĎOVANIE) ---
const CATEGORY_PRIORITY = {
    "appetizer": 1, // Predjedlá
    "soup": 2,      // Polievky
    "main": 3,      // Hlavné jedlá
    "dessert": 4,   // Dezerty
    "drink": 5,     // Nápoje
    "alco": 5,      // Alkohol
    "nealko": 5     // Nealko
};

// ==========================================
// FUNKCIE PRE PRÁCU S DÁTAMI A MENU
// ==========================================

async function loadMenuData() {
    try {
        const response = await fetch(`${BACKEND_URL}/menu`, { method: "GET" });
        if (!response.ok) throw new Error("Chyba načítania menu");

        menuData = await response.json();
        renderMenuData(menuData);
        
        if (currentTable) {
            updateOrderDisplay();
        }
    } catch (error) {
        console.error("Chyba načítania údajov:", error);
        alert("Nepodarilo sa načítať údaje zo servera.");
    }
}

function renderMenuData(data) {
    $(".table-grid").empty();
    $(".menu-categories").empty();
    $(".menu-items").empty();

    if (data.tables) {
        data.tables.forEach((table) => {
            $(".table-grid").append(`<button class="table-button" data-table="${table.number}">${table.name}</button>`);
        });
    }
    updateTableStyles();

    if (data.categories) {
        data.categories.sort((a, b) => (CATEGORY_PRIORITY[a.id] || 99) - (CATEGORY_PRIORITY[b.id] || 99));
        data.categories.forEach((category) => {
            $(".menu-categories").append(`<button class="category-button" data-category="${category.id}">${category.name}</button>`);
        });
    }

    if (data.menuItems) {
        data.menuItems.forEach((item) => {
            $(".menu-items").append(
                `<div class="menu-item" data-category="${item.category}" data-price="${item.price}">
                    <h3>${item.name}</h3>
                    <p>${item.price.toFixed(2)} €</p>
                </div>`
            );
        });
    }
}

// Pomocná funkcia: Získanie priority (čísla)
function getItemPriority(itemName, itemData) {
    let categoryId = itemData.category;
    if (!categoryId && menuData && menuData.menuItems) {
        const foundItem = menuData.menuItems.find(i => i.name === itemName);
        if (foundItem) categoryId = foundItem.category;
    }
    const priority = CATEGORY_PRIORITY[categoryId];
    return priority !== undefined ? priority : 99;
}

// NOVÁ FUNKCIA: Získanie názvu kategórie pre nadpis (napr. "main" -> "Hlavné jedlá")
function getCategoryName(categoryId) {
    if (!menuData || !menuData.categories) return "Ostatné";
    const category = menuData.categories.find(c => c.id === categoryId);
    return category ? category.name : "Ostatné";
}

// ==========================================
// HLAVNÁ FUNKCIA PRE ZOBRAZENIE (S KATEGÓRIAMI)
// ==========================================

function updateOrderDisplay() {
    const orderItems = $(".order-items");
    orderItems.empty();

    if (!currentTable || !tableOrders[currentTable]) {
        $(".total-section span:last").text("0.00 €");
        return;
    }

    // 1. Prevedieme na pole
    const itemsArray = Object.entries(tableOrders[currentTable].items);

    // 2. Zoradíme
    itemsArray.sort((a, b) => {
        const nameA = a[0]; const dataA = a[1];
        const nameB = b[0]; const dataB = b[1];
        const pA = getItemPriority(nameA, dataA);
        const pB = getItemPriority(nameB, dataB);

        if (pA !== pB) return pA - pB;
        return nameA.localeCompare(nameB);
    });

    // 3. Vykreslenie s nadpismi kategórií
    let lastCategoryId = null; // Pomocná premenná na sledovanie zmeny kategórie

    itemsArray.forEach(([itemName, item]) => {
        // Zistíme ID kategórie pre túto položku
        let currentCategoryId = item.category;
        if (!currentCategoryId && menuData && menuData.menuItems) {
            const found = menuData.menuItems.find(i => i.name === itemName);
            if (found) currentCategoryId = found.category;
        }

        // AK SA ZMENILA KATEGÓRIA, VLOŽÍME NADPIS
        // (Ale len ak to nie je "undefined" kategória, alebo ak chceme zobraziť aj tú)
        if (currentCategoryId !== lastCategoryId) {
            const prettyName = getCategoryName(currentCategoryId);
            orderItems.append(`<div class="order-category-title">${prettyName}</div>`);
            lastCategoryId = currentCategoryId;
        }

        // Vykreslenie samotnej položky
        const itemTotal = (item.price * item.quantity).toFixed(2);
        const newItem = $(`
            <div class="order-item">
                <span class="item-quantity">${item.quantity}x</span>
                <span class="item-name">${itemName}</span>
                <div class="quantity-controls">
                    <button class="quantity-btn minus">-</button>
                    <button class="quantity-btn plus">+</button>
                </div>
                <span class="item-total">${itemTotal} €</span>
            </div>
        `);

        newItem.find(".minus").on("click", () => updateItemQuantity(itemName, -1));
        newItem.find(".plus").on("click", () => updateItemQuantity(itemName, 1));
        orderItems.append(newItem);
    });

    $(".total-section span:last").text(tableOrders[currentTable].total.toFixed(2) + " €");
}

// Aktualizácia množstva
function updateItemQuantity(itemName, delta) {
    if (!currentTable || !tableOrders[currentTable]) return;
    const item = tableOrders[currentTable].items[itemName];
    if (!item) return;

    const newQuantity = item.quantity + delta;
    if (newQuantity <= 0) {
        tableOrders[currentTable].total -= item.price * item.quantity;
        delete tableOrders[currentTable].items[itemName];
    } else {
        tableOrders[currentTable].total += item.price * delta;
        item.quantity = newQuantity;
    }

    if (Object.keys(tableOrders[currentTable].items).length === 0) {
        delete tableOrders[currentTable];
        $(`.table-button[data-table="${currentTable}"]`).removeClass("has-order");
    }

    saveOrders();
    updateOrderDisplay();
}

// ==========================================
// UKLADANIE A BACKEND
// ==========================================

async function saveOrdersToBackend() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            const cleanedOrders = Object.fromEntries(
                Object.entries(tableOrders).filter(([k, v]) => v && Object.keys(v.items || {}).length > 0)
            );
            const dataToSave = Object.keys(cleanedOrders).length === 0 ? { empty: true } : cleanedOrders;

            await fetch(`${BACKEND_URL}/orders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataToSave),
            });
        } catch (error) { console.error("Chyba ukladania:", error); }
    }, 2500);
}

function saveOrders() {
    saveOrdersToBackend();
    updateOrderDisplay();
}

async function loadOrdersFromBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/orders`, { method: "GET" });
        if (response.ok) tableOrders = await response.json() || {};
    } catch (error) { console.error("Chyba načítania:", error); }
}

function updateTableStyles() {
    $(".table-button").removeClass("has-order");
    Object.keys(tableOrders).forEach((table) => {
        if (tableOrders[table] && Object.keys(tableOrders[table].items).length > 0) {
            $(`.table-button[data-table="${table}"]`).addClass("has-order");
        }
    });
}

// ==========================================
// MODUL: ROZDELENIE ÚČTU (SPLIT ORDER)
// ==========================================

function openSplitOrderModal() {
    if (!currentTable) return alert("Najprv vyberte stôl!");
    if (!tableOrders[currentTable] || !Object.keys(tableOrders[currentTable].items).length) return alert("Prázdny stôl.");
    itemsToMove = {}; 
    $("#split-order-modal").fadeIn();
    renderSplitOrderModalContent();
}

function moveItemsToTargetTable(targetTable, itemName, quantity) {
    if (!targetTable) return alert("Vyberte cieľový stôl!");
    const item = tableOrders[currentTable].items[itemName];
    if (!item || item.quantity < quantity) return alert("Nedostatok položiek.");

    if (!itemsToMove[targetTable]) itemsToMove[targetTable] = { items: {}, total: 0 };
    if (itemsToMove[targetTable].items[itemName]) {
        itemsToMove[targetTable].items[itemName].quantity += quantity;
    } else {
        itemsToMove[targetTable].items[itemName] = { ...item, quantity: quantity };
    }
    itemsToMove[targetTable].total += item.price * quantity;

    item.quantity -= quantity;
    if (item.quantity <= 0) delete tableOrders[currentTable].items[itemName];
    tableOrders[currentTable].total -= item.price * quantity;
    renderSplitOrderModalContent();
}

function moveItemBackToOriginalTable(itemName, quantity) {
    if (!targetTable || !itemsToMove[targetTable]) return;
    const item = itemsToMove[targetTable].items[itemName];
    if (!item || item.quantity < quantity) return;

    if (tableOrders[currentTable].items[itemName]) {
        tableOrders[currentTable].items[itemName].quantity += quantity;
    } else {
        tableOrders[currentTable].items[itemName] = { ...item, quantity: quantity };
    }
    tableOrders[currentTable].total += item.price * quantity;

    item.quantity -= quantity;
    if (item.quantity <= 0) delete itemsToMove[targetTable].items[itemName];
    renderSplitOrderModalContent();
}

function renderSplitOrderModalContent() {
    const $modalContent = $("#split-order-modal .modal-content");
    $modalContent.empty();

    const $columns = $(`
        <div class="split-order-columns">
            <div class="current-items-column">
                <h3>Stôl ${currentTable}</h3>
                <div class="current-items-list"></div>
            </div>
            <div class="moved-items-column">
                <h3>Presunúť na: <span id="target-table-number">${targetTable ? targetTable : ''}</span></h3>
                <div class="target-table-buttons"></div>
                <div class="moved-items-list"></div>
            </div>
        </div>
        <div class="modal-actions">
            <button class="cancel-split-button">Zrušiť</button>
            <button class="confirm-split-button">Presunúť</button>
        </div>
    `);

    const $targetTableButtons = $columns.find(".target-table-buttons");
    if (menuData && menuData.tables) {
        menuData.tables.forEach(table => {
            if (table.number !== currentTable) {
                $targetTableButtons.append(`<button class="target-table-button" data-table="${table.number}">Stôl ${table.number}</button>`);
            }
        });
    }

    const $currentItemsList = $columns.find(".current-items-list");
    if (tableOrders[currentTable]?.items) {
        Object.entries(tableOrders[currentTable].items).forEach(([itemName, item]) => {
            const $item = $(`
                <div class="split-order-item">
                    <span>${item.quantity}x ${itemName}</span>
                    <div class="move-buttons">
                        <button class="move-item-button">></button>
                        <button class="move-all-button">>></button>
                    </div>
                </div>
            `);
            $item.find(".move-item-button").click(() => { if (targetTable) moveItemsToTargetTable(targetTable, itemName, 1); });
            $item.find(".move-all-button").click(() => { if (targetTable) moveItemsToTargetTable(targetTable, itemName, item.quantity); });
            $currentItemsList.append($item);
        });
    }

    const updateMovedItemsList = (selectedTable) => {
        const $movedItemsList = $columns.find(".moved-items-list");
        $movedItemsList.empty();
        $targetTableButtons.hide();
        $columns.find("#target-table-number").text(selectedTable);

        if (tableOrders[selectedTable]?.items) {
            Object.entries(tableOrders[selectedTable].items).forEach(([itemName, item]) => {
                $movedItemsList.append(`<div class="split-order-item"><span>${item.quantity}x ${itemName} (Tam)</span></div>`);
            });
        }
        if (itemsToMove[selectedTable]?.items) {
            Object.entries(itemsToMove[selectedTable].items).forEach(([itemName, item]) => {
                const $item = $(`
                    <div class="split-order-item">
                        <span>${item.quantity}x ${itemName} (Presun)</span>
                        <div class="move-buttons">
                            <button class="move-back-button"><</button>
                            <button class="move-all-back-button"><<</button>
                        </div>
                    </div>
                `);
                $item.find(".move-back-button").click(() => moveItemBackToOriginalTable(itemName, 1));
                $item.find(".move-all-back-button").click(() => moveItemBackToOriginalTable(itemName, item.quantity));
                $movedItemsList.append($item);
            });
        }
    };

    $columns.find(".target-table-button").click(function() {
        targetTable = parseInt($(this).data("table"));
        updateMovedItemsList(targetTable);
    });

    $columns.find(".cancel-split-button").click(() => {
        if (itemsToMove[targetTable]?.items) {
            Object.entries(itemsToMove[targetTable].items).forEach(([itemName, item]) => {
                if (tableOrders[currentTable].items[itemName]) tableOrders[currentTable].items[itemName].quantity += item.quantity;
                else tableOrders[currentTable].items[itemName] = { ...item };
                tableOrders[currentTable].total += item.price * item.quantity;
            });
        }
        currentTable = null; targetTable = null; itemsToMove = {};
        $("#split-order-modal").fadeOut();
        updateOrderDisplay();
    });

    $columns.find(".confirm-split-button").click(() => {
        if (!targetTable) return alert("Vyberte stôl!");
        if (itemsToMove[targetTable]?.items) {
            if (!tableOrders[targetTable]) tableOrders[targetTable] = { items: {}, total: 0 };
            Object.entries(itemsToMove[targetTable].items).forEach(([itemName, item]) => {
                if (tableOrders[targetTable].items[itemName]) tableOrders[targetTable].items[itemName].quantity += item.quantity;
                else tableOrders[targetTable].items[itemName] = { ...item };
                tableOrders[targetTable].total += item.price * item.quantity;
            });
        }
        itemsToMove = {}; saveOrders();
        currentTable = null; targetTable = null;
        $("#split-order-modal").fadeOut();
        updateOrderDisplay(); updateTableStyles();
    });

    $modalContent.append($columns);
    if (targetTable) updateMovedItemsList(targetTable);
}

// ==========================================
// PLATBA, STORNO, INICIALIZÁCIA
// ==========================================

async function payOrder() {
    if (!currentTable || !tableOrders[currentTable]) return alert("Prázdny stôl!");
    const totalAmount = tableOrders[currentTable].total.toFixed(2);
    const paidOrder = {
        table: currentTable,
        items: tableOrders[currentTable].items,
        total: totalAmount,
        date: new Date().toISOString(),
    };

    try {
        $('#loading-modal').fadeIn(); 
        const response = await fetch(`${BACKEND_URL}/orders/paid`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(paidOrder)
        });
        if (!response.ok) throw new Error("Chyba platby");

        delete tableOrders[currentTable];
        saveOrdersToBackend();
        $(`.table-button[data-table="${currentTable}"]`).removeClass("has-order");
        updateOrderDisplay();

        const qrResponse = await fetch(`${BACKEND_URL}/generate-qr?amount=${totalAmount}&table=${currentTable}`);
        if (qrResponse.ok) {
            $("#qr-code").attr("src", qrResponse.url);
            $('#loading-modal').fadeOut(); $("#qr-modal").fadeIn();
        }
    } catch (error) {
        console.error("Chyba:", error); alert("Chyba pri platbe."); $('#loading-modal').fadeOut(); 
    }
}

function cancelOrder() {
    if (!currentTable || !tableOrders[currentTable]) return;
    if (confirm(`Zrušiť objednávku pre stôl ${currentTable}?`)) {
        delete tableOrders[currentTable];
        saveOrdersToBackend();
        updateOrderDisplay();
        $(`.table-button[data-table="${currentTable}"]`).removeClass("has-order");
        $(".current-order h2").text("Vyberte stôl");
        $(".action-buttons button").prop("disabled", true);
    }
}

function closeQrModal() {
    $("#qr-modal").fadeOut(); currentTable = null;
    $(".current-order h2").text("Vyberte stôl"); $(".action-buttons button").prop("disabled", true);
}

function logout() { localStorage.removeItem("authToken"); window.location.href = "/POS/login.html"; }

$(document).ready(async function () {
    $(document).on("click", ".table-button", function () {
        const tableNumber = $(this).data("table");
        $(".table-button").removeClass("active"); $(this).addClass("active");
        currentTable = tableNumber;
        updateOrderDisplay();
        $(".action-buttons button").prop("disabled", false);
        $(".current-order h2").text(`Stôl ${tableNumber}`);
    });

    $(document).on("click", ".category-button", function () {
        const selectedCategory = $(this).data("category");
        $(".category-button").removeClass("active"); $(this).addClass("active");
        $(".menu-item").hide(); $(`.menu-item[data-category="${selectedCategory}"]`).show();
    });

    $(document).on("click", ".menu-item", function () {
        if (!currentTable) return alert("Vyberte stôl!");
        const itemName = $(this).find("h3").text();
        const itemPrice = parseFloat($(this).data("price"));
        const categoryId = $(this).data("category");

        if (!tableOrders[currentTable]) tableOrders[currentTable] = { items: {}, total: 0 };
        if (tableOrders[currentTable].items[itemName]) {
            tableOrders[currentTable].items[itemName].quantity += 1;
            tableOrders[currentTable].total += itemPrice;
            tableOrders[currentTable].items[itemName].category = categoryId;
        } else {
            tableOrders[currentTable].items[itemName] = { price: itemPrice, quantity: 1, category: categoryId };
            tableOrders[currentTable].total += itemPrice;
        }

        $(`.table-button[data-table="${currentTable}"]`).addClass("has-order");
        saveOrders(); updateOrderDisplay();
    });

    $(".split-order-button").click(openSplitOrderModal);
    $(".pay-button").click(payOrder);
    $(".cancel-button").click(cancelOrder);
    $("#close-modal").click(closeQrModal);
    $(".logout-button").click(logout);

    await loadOrdersFromBackend();
    loadMenuData();
    updateTableStyles();
});