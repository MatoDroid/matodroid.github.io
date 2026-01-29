// Globálne premenné
let currentTable = null; // Globálna premenná pre aktuálny stôl
let tableOrders = {}; // Globálna premenná pre objednávky
let menuData = null; // Globálna premenná pre uloženie dát z menu
let itemsToMove = {}; // Globálna premenná pre dočasné uloženie položiek na presun (Split Order)
let saveTimeout = null; // Timeout identifikátor pre oneskorené uloženie
let targetTable = null; // Globálna premenná pre cieľový stôl (Split Order)
const BACKEND_URL = "https://matodroid.onrender.com"; // URL backendu

// --- DEFINÍCIA PRIORÍT KATEGÓRIÍ (Pre zoraďovanie) ---
// Menšie číslo = vyššie v zozname
const CATEGORY_PRIORITY = {
    "appetizer": 1, // Predjedlá
    "soup": 2,      // Polievky
    "main": 3,      // Hlavné jedlá
    "dessert": 4,   // Dezerty
    "drink": 5,     // Nápoje
    "alco": 5,      // Alkohol
    "nealko": 5     // Nealko
};

// Funkcia na načítanie údajov zo servera (Menu)
async function loadMenuData() {
    try {
        const response = await fetch(`${BACKEND_URL}/menu`, {
            method: "GET"
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Chyba pri načítaní dát: ${response.status} ${response.statusText} - ${errorText}`);
        }

        menuData = await response.json();
        renderMenuData(menuData); // Vykreslenie menu
        
        // Ak máme otvorený stôl, po načítaní menu preusporiadame objednávku (aby sa priradili kategórie)
        if (currentTable) {
            updateOrderDisplay();
        }

    } catch (error) {
        console.error("Chyba načítania údajov:", error);
        alert("Nepodarilo sa načítať údaje zo servera. Skontrolujte pripojenie a skúste znova.");
    }
}

// Funkcia na zobrazenie menu a stolov na stránke
function renderMenuData(data) {
    $(".table-grid").empty();
    $(".menu-categories").empty();
    $(".menu-items").empty();

    // Pridanie stolov
    data.tables.forEach((table) => {
        $(".table-grid").append(
            `<button class="table-button" data-table="${table.number}">${table.name}</button>`
        );
    });

    updateTableStyles();

    // Zoradenie kategórií pre hornú lištu (tlačidlá)
    data.categories.sort((a, b) => {
        const pA = CATEGORY_PRIORITY[a.id] || 99;
        const pB = CATEGORY_PRIORITY[b.id] || 99;
        return pA - pB;
    });

    // Pridanie kategórií
    data.categories.forEach((category) => {
        $(".menu-categories").append(
            `<button class="category-button" data-category="${category.id}">${category.name}</button>`
        );
    });

    // Pridanie položiek menu
    data.menuItems.forEach((item) => {
        // Dôležité: Ukladáme data-category do HTML, aby sme ju vedeli prečítať pri kliknutí
        $(".menu-items").append(
            `<div class="menu-item" data-category="${item.category}" data-price="${item.price}">
                <h3>${item.name}</h3>
                <p>${item.price.toFixed(2)} €</p>
            </div>`
        );
    });
}

// Funkcia na aktualizáciu štýlov stolov (ak majú objednávku)
function updateTableStyles() {
    $(".table-button").removeClass("has-order");
    Object.keys(tableOrders).forEach((table) => {
        if (tableOrders[table] && Object.keys(tableOrders[table].items).length > 0) {
            $(`.table-button[data-table="${table}"]`).addClass("has-order");
        }
    });
}

// Pomocná funkcia na zistenie priority položky
function getItemPriority(itemName, itemData) {
    // 1. Skúsime zistiť kategóriu priamo z uloženej položky v objednávke
    let categoryId = itemData.category;

    // 2. Ak v objednávke nie je (staré dáta), skúsime ju nájsť v menuData podľa názvu
    if (!categoryId && menuData && menuData.menuItems) {
        const foundItem = menuData.menuItems.find(i => i.name === itemName);
        if (foundItem) {
            categoryId = foundItem.category;
        }
    }

    // 3. Vrátime číslo priority z mapy (ak neexistuje, dáme 99 = na koniec)
    return CATEGORY_PRIORITY[categoryId] || 99;
}

// Zobrazenie objednávok (HLAVNÁ FUNKCIA PRE ZORADENIE)
function updateOrderDisplay() {
    const orderItems = $(".order-items");
    orderItems.empty();

    if (!currentTable || !tableOrders[currentTable]) {
        $(".total-section span:last").text("0.00 €");
        return;
    }

    // 1. Prevedieme objekt položiek na pole, aby sme mohli triediť
    const itemsArray = Object.entries(tableOrders[currentTable].items);

    // 2. ZORADENIE POĽA
    itemsArray.sort((a, b) => {
        const nameA = a[0];
        const dataA = a[1];
        const nameB = b[0];
        const dataB = b[1];

        const priorityA = getItemPriority(nameA, dataA);
        const priorityB = getItemPriority(nameB, dataB);

        // Porovnanie podľa priority (menšie číslo skôr)
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        // Ak sú priority rovnaké, zoradíme podľa abecedy
        return nameA.localeCompare(nameB);
    });

    // 3. Vykreslenie zoradených položiek
    itemsArray.forEach(([itemName, item]) => {
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

        // Udalosti pre tlačidlá + a -
        newItem.find(".minus").on("click", () => updateItemQuantity(itemName, -1));
        newItem.find(".plus").on("click", () => updateItemQuantity(itemName, 1));

        orderItems.append(newItem);
    });

    // Aktualizácia celkovej sumy
    $(".total-section span:last").text(
        tableOrders[currentTable].total.toFixed(2) + " €"
    );
}

// Aktualizácia množstva položky
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

    // Ak je objednávka prázdna, zrušíme stôl
    if (Object.keys(tableOrders[currentTable].items).length === 0) {
        delete tableOrders[currentTable];
        $(`.table-button[data-table="${currentTable}"]`).removeClass("has-order");
    }

    saveOrders(); // Uloženie na backend
    updateOrderDisplay(); // Prekreslenie (vrátane zoradenia)
}

// Funkcia na uloženie objednávok na backend
async function saveOrdersToBackend() {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        try {
            const cleanedOrders = Object.fromEntries(
                Object.entries(tableOrders).filter(([key, value]) => value && Object.keys(value.items || {}).length > 0)
            );

            const dataToSave = Object.keys(cleanedOrders).length === 0 ? { empty: true } : cleanedOrders;

            const response = await fetch(`${BACKEND_URL}/orders`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(dataToSave),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("Chyba pri ukladaní objednávok na backend:", response.statusText, errorText);
            }
        } catch (error) {
            console.error("Chyba pri ukladaní objednávok na backend:", error);
        }
    }, 2500); // Oneskorenie 2.5s
}

// Funkcia na uloženie objednávok (lokálne update + backend)
function saveOrders() {
    saveOrdersToBackend();
    updateOrderDisplay();
}

// Funkcia na načítanie objednávok z backendu
async function loadOrdersFromBackend() {
    try {
        const response = await fetch(`${BACKEND_URL}/orders`, {
            method: "GET",
        });
        if (response.ok) {
            const data = await response.json();
            tableOrders = data || {};
        } else {
            console.error("Chyba pri načítaní objednávok z backendu:", response.statusText);
        }
    } catch (error) {
        console.error("Chyba pri načítaní objednávok z backendu:", error);
    }
}

// --- LOGIKA ROZDELENIA ÚČTU (Split Order) ---

function openSplitOrderModal() {
    if (!currentTable) {
        alert("Najprv vyberte stôl!");
        return;
    }
    if (!tableOrders[currentTable] || !Object.keys(tableOrders[currentTable].items).length) {
        alert("Pre tento stôl neexistuje žiadna objednávka.");
        return;
    }

    itemsToMove = {}; // Reset
    $("#split-order-modal").fadeIn();
    renderSplitOrderModalContent();
}

function moveItemsToTargetTable(targetTable, itemName, quantity) {
    if (!targetTable) { alert("Najprv vyberte cieľový stôl!"); return; }
    if (!tableOrders[currentTable] || !tableOrders[currentTable].items) return;

    const item = tableOrders[currentTable].items[itemName];
    if (!item || item.quantity < quantity) { alert("Nedostatok položiek."); return; }

    // Virtuálny presun DO cieľa
    if (!itemsToMove[targetTable]) itemsToMove[targetTable] = { items: {}, total: 0 };

    if (itemsToMove[targetTable].items[itemName]) {
        itemsToMove[targetTable].items[itemName].quantity += quantity;
    } else {
        itemsToMove[targetTable].items[itemName] = { ...item, quantity: quantity };
    }
    itemsToMove[targetTable].total += item.price * quantity;

    // Odobranie Z aktuálneho (virtuálne)
    item.quantity -= quantity;
    if (item.quantity <= 0) delete tableOrders[currentTable].items[itemName];
    tableOrders[currentTable].total -= item.price * quantity;

    renderSplitOrderModalContent();
}

function moveItemBackToOriginalTable(itemName, quantity) {
    if (!targetTable || !itemsToMove[targetTable]) return;

    const item = itemsToMove[targetTable].items[itemName];
    if (!item || item.quantity < quantity) return;

    // Vrátenie SPÄŤ
    if (tableOrders[currentTable].items[itemName]) {
        tableOrders[currentTable].items[itemName].quantity += quantity;
    } else {
        tableOrders[currentTable].items[itemName] = { ...item, quantity: quantity };
    }
    tableOrders[currentTable].total += item.price * quantity;

    // Odstránenie z CIEĽA
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
                <h3>Aktuálne položky (Stôl ${currentTable})</h3>
                <div class="current-items-list"></div>
            </div>
            <div class="moved-items-column">
                <h3>Presunúť na stôl: <span id="target-table-number">${targetTable ? targetTable : ''}</span></h3>
                <div class="target-table-buttons"></div>
                <div class="moved-items-list"></div>
            </div>
        </div>
        <div class="modal-actions">
            <button class="cancel-split-button">Zrušiť</button>
            <button class="confirm-split-button">Presunúť</button>
        </div>
    `);

    // Tlačidlá cieľových stolov
    const $targetTableButtons = $columns.find(".target-table-buttons");
    if (menuData && menuData.tables) {
        menuData.tables.forEach(table => {
            if (table.number !== currentTable) {
                $targetTableButtons.append(`<button class="target-table-button" data-table="${table.number}">Stôl ${table.number}</button>`);
            }
        });
    }

    // Zoznam aktuálnych položiek
    const $currentItemsList = $columns.find(".current-items-list");
    if (tableOrders[currentTable]?.items) {
        Object.entries(tableOrders[currentTable].items).forEach(([itemName, item]) => {
            const $item = $(`
                <div class="split-order-item">
                    <span>${item.quantity}x ${itemName}</span>
                    <div class="move-buttons">
                        <button class="move-item-button" title="Presunúť jeden">></button>
                        <button class="move-all-button" title="Presunúť všetko">>></button>
                    </div>
                </div>
            `);
            $item.find(".move-item-button").click(() => { if (targetTable) moveItemsToTargetTable(targetTable, itemName, 1); });
            $item.find(".move-all-button").click(() => { if (targetTable) moveItemsToTargetTable(targetTable, itemName, item.quantity); });
            $currentItemsList.append($item);
        });
    }

    // Aktualizácia pravého stĺpca
    const updateMovedItemsList = (selectedTable) => {
        const $movedItemsList = $columns.find(".moved-items-list");
        $movedItemsList.empty();
        $targetTableButtons.hide();
        $columns.find("#target-table-number").text(selectedTable);

        // Už existujúce položky na cieľovom stole
        if (tableOrders[selectedTable]?.items) {
            Object.entries(tableOrders[selectedTable].items).forEach(([itemName, item]) => {
                $movedItemsList.append(`<div class="split-order-item"><span>${item.quantity}x ${itemName} (Už na stole)</span></div>`);
            });
        }

        // Virtuálne presunuté položky
        if (itemsToMove[selectedTable]?.items) {
            Object.entries(itemsToMove[selectedTable].items).forEach(([itemName, item]) => {
                const $item = $(`
                    <div class="split-order-item">
                        <span>${item.quantity}x ${itemName} (Presúvané)</span>
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

    // Eventy
    $columns.find(".target-table-button").click(function() {
        targetTable = parseInt($(this).data("table"));
        updateMovedItemsList(targetTable);
    });

    $columns.find(".cancel-split-button").click(() => {
        // Vrátenie zmien
        if (itemsToMove[targetTable]?.items) {
            Object.entries(itemsToMove[targetTable].items).forEach(([itemName, item]) => {
                if (tableOrders[currentTable].items[itemName]) {
                    tableOrders[currentTable].items[itemName].quantity += item.quantity;
                } else {
                    tableOrders[currentTable].items[itemName] = { ...item };
                }
            });
        }
        currentTable = null; targetTable = null; itemsToMove = {};
        $("#split-order-modal").fadeOut();
    });

    $columns.find(".confirm-split-button").click(() => {
        if (!targetTable) { alert("Vyberte stôl!"); return; }
        
        // Aplikovanie zmien
        if (itemsToMove[targetTable]?.items) {
            if (!tableOrders[targetTable]) tableOrders[targetTable] = { items: {}, total: 0 };
            
            Object.entries(itemsToMove[targetTable].items).forEach(([itemName, item]) => {
                if (tableOrders[targetTable].items[itemName]) {
                    tableOrders[targetTable].items[itemName].quantity += item.quantity;
                } else {
                    tableOrders[targetTable].items[itemName] = { ...item };
                }
                tableOrders[targetTable].total += item.price * item.quantity;
            });
        }
        itemsToMove = {};
        saveOrders();
        currentTable = null; targetTable = null;
        $("#split-order-modal").fadeOut();
        updateOrderDisplay();
        updateTableStyles();
    });

    $modalContent.append($columns);
    if (targetTable) updateMovedItemsList(targetTable);
}

// --- FUNKCIA PLATBA ---
async function payOrder() {
    if (!currentTable || !tableOrders[currentTable]) {
        alert("Najprv vyberte stôl a pridajte položky!");
        return;
    }

    const totalAmount = tableOrders[currentTable].total.toFixed(2);
    const paidOrder = {
        table: currentTable,
        items: tableOrders[currentTable].items,
        total: totalAmount,
        date: new Date().toISOString(),
    };

    try {
        const response = await fetch(`${BACKEND_URL}/orders/paid`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(paidOrder),
        });

        if (!response.ok) throw new Error("Chyba platby");

        delete tableOrders[currentTable];
        saveOrdersToBackend();
        $(`.table-button[data-table="${currentTable}"]`).removeClass("has-order");
        updateOrderDisplay();

        // QR kód
        const qrResponse = await fetch(`${BACKEND_URL}/generate-qr?amount=${totalAmount}&table=${currentTable}`);
        if (qrResponse.ok) {
            $("#qr-code").attr("src", qrResponse.url);
            $("#qr-modal").fadeIn();
        }

    } catch (error) {
        console.error("Chyba:", error);
        alert("Chyba pri platbe.");
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
    $("#qr-modal").fadeOut();
    currentTable = null;
    $(".current-order h2").text("Vyberte stôl");
    $(".action-buttons button").prop("disabled", true);
}

function logout() {
    localStorage.removeItem("authToken");
    window.location.href = "/POS/login.html";
}

// --- INITIALIZÁCIA PO NAČÍTANÍ STRÁNKY ---
$(document).ready(async function () {
    
    // 1. Klik na stôl
    $(document).on("click", ".table-button", function () {
        const tableNumber = $(this).data("table");
        $(".table-button").removeClass("active");
        $(this).addClass("active");
        currentTable = tableNumber;
        updateOrderDisplay(); // Zobrazí a zoradí položky
        $(".action-buttons button").prop("disabled", false);
        $(".current-order h2").text(`Aktuálna objednávka - Stôl ${tableNumber}`);
    });

    // 2. Klik na kategóriu
    $(document).on("click", ".category-button", function () {
        const selectedCategory = $(this).data("category");
        $(".category-button").removeClass("active");
        $(this).addClass("active");
        $(".menu-item").hide();
        $(`.menu-item[data-category="${selectedCategory}"]`).show();
    });

    // 3. Klik na položku menu (PRIDANIE DO OBJEDNÁVKY)
    $(document).on("click", ".menu-item", function () {
        if (!currentTable) { alert("Najprv vyberte stôl!"); return; }

        const itemName = $(this).find("h3").text();
        const itemPrice = parseFloat($(this).data("price"));
        // DÔLEŽITÉ: Načítame kategóriu priamo z HTML atribútu
        const categoryId = $(this).data("category");

        if (!tableOrders[currentTable]) tableOrders[currentTable] = { items: {}, total: 0 };

        if (tableOrders[currentTable].items[itemName]) {
            tableOrders[currentTable].items[itemName].quantity += 1;
            tableOrders[currentTable].total += itemPrice;
            tableOrders[currentTable].items[itemName].category = categoryId; // Update kategórie
        } else {
            tableOrders[currentTable].items[itemName] = { 
                price: itemPrice, 
                quantity: 1, 
                category: categoryId // Uloženie kategórie
            };
            tableOrders[currentTable].total += itemPrice;
        }

        $(`.table-button[data-table="${currentTable}"]`).addClass("has-order");
        saveOrders();
        updateOrderDisplay(); // Okamžité prekreslenie a zoradenie
    });

    $(".split-order-button").click(openSplitOrderModal);
    $(".pay-button").click(payOrder);
    $(".cancel-button").click(cancelOrder);
    $("#close-modal").click(closeQrModal);
    $("#logout-button").click(logout);

    // Načítanie dát
    await loadOrdersFromBackend();
    loadMenuData();
    updateTableStyles();
});