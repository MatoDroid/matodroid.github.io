// Globálne premenné
let currentTable = null; // Globálna premenná pre aktuálny stôl
let tableOrders = {}; // Globálna premenná pre objednávky
let menuData = null; // Globálna premenná pre uloženie dát z menu
let itemsToMove = {}; // Globálna premenná pre dočasné uloženie položiek na presun
let saveTimeout = null; // Timeout identifikátor pre oneskorené uloženie
let targetTable = null; // Globálna premenná pre cieľový stôl
const BACKEND_URL = "https://matodroid.onrender.com"; // URL backendu

// NOVÉ: Definícia priorít kategórií pre zoradenie
const CATEGORY_PRIORITY = {
    appetizer: 1, // Predjedlá
    soup: 2,      // Polievky
    main: 3,      // Hlavné jedlá
    dessert: 4,   // Dezerty
    drink: 5,     // Nápoje
    alco: 6,
    nealko: 6
};

// Funkcia na načítanie údajov zo servera
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
        renderMenuData(menuData); // Načítanie menu dát
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

    // Pridanie kategórií
    data.categories.forEach((category) => {
        $(".menu-categories").append(
            `<button class="category-button" data-category="${category.id}">${category.name}</button>`
        );
    });

    // Pridanie položiek menu
    data.menuItems.forEach((item) => {
        $(".menu-items").append(
            `<div class="menu-item" data-category="${item.category}" data-price="${item.price}">
                <h3>${item.name}</h3>
                <p>${item.price.toFixed(2)} €</p>
            </div>`
        );
    });
}

// Funkcia na aktualizáciu štýlov stolov
function updateTableStyles() {
    $(".table-button").removeClass("has-order");
    Object.keys(tableOrders).forEach((table) => {
        $(`.table-button[data-table="${table}"]`).addClass("has-order");
    });
}

// Pomocná funkcia na získanie priority položky
function getItemPriority(itemData) {
    if (!itemData?.category) return 99;
    return CATEGORY_PRIORITY[itemData.category] ?? 99;
}


// Zobrazenie objednávok vrátane tlačidiel + a - (UPRAVENÉ TREDENIE)
function updateOrderDisplay() {
    const orderItems = $(".order-items");
    orderItems.empty();

    if (!currentTable || !tableOrders[currentTable]) {
        $(".total-section span:last").text("0.00 €");
        return;
    }

    // Prevedieme objekt položiek na pole, aby sme ich mohli zoradiť
    const itemsArray = Object.entries(tableOrders[currentTable].items);

    // ZORADENIE PODĽA PRIORÍT KATEGÓRIÍ
    itemsArray.sort((a, b) => {
        const pDiff = getItemPriority(a[1]) - getItemPriority(b[1]);
        if (pDiff !== 0) return pDiff;
        return a[0].localeCompare(b[0], "sk");
    });


    // Vykreslenie zoradených položiek
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

    if (Object.keys(tableOrders[currentTable].items).length === 0) {
        delete tableOrders[currentTable];
        $(`.table-button[data-table="${currentTable}"]`).removeClass("has-order");
    }

    saveOrders(); // Uloženie stavu na backend
}

// Funkcia na uloženie objednávok na backend
async function saveOrdersToBackend() {
    // Vyčistenie predchádzajúceho timeoutu
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    // Nastavenie nového timeoutu
    saveTimeout = setTimeout(async () => {
        try {
            // Filtrovanie prázdnych objednávok
            const cleanedOrders = Object.fromEntries(
                Object.entries(tableOrders).filter(([key, value]) => value && Object.keys(value.items || {}).length > 0)
            );

            // Ak nie sú objednávky, odoslať minimálny validný objekt
            const dataToSave = Object.keys(cleanedOrders).length === 0 ? { empty: true } : cleanedOrders;

            const response = await fetch(`${BACKEND_URL}/orders`, {
                method: "POST", // Používame POST pre ukladanie
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(dataToSave),
            });

            if (response.ok) {
                
            } else {
                const errorText = await response.text();
                console.error("Chyba pri ukladaní objednávok na backend:", response.statusText, errorText);
            }
        } catch (error) {
            console.error("Chyba pri ukladaní objednávok na backend:", error);
        }
    }, 2500); // Oneskorenie 2500 ms = 2.5 sek
}

// Funkcia na uloženie objednávok
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

// Funkcia na zobrazenie modálneho okna pre rozdelenie objednávky
function openSplitOrderModal() {
    if (!currentTable) {
        alert("Najprv vyberte stôl!");
        return;
    }

    if (!tableOrders[currentTable] || !Object.keys(tableOrders[currentTable].items).length) {
        alert("Pre tento stôl neexistuje žiadna objednávka.");
        return;
    }

    // Resetovanie položiek na presun
    itemsToMove = {};

    // Zobrazenie modálneho okna
    $("#split-order-modal").fadeIn();

    // Naplnenie modálneho okna aktuálnymi položkami
    renderSplitOrderModalContent();
}

// Funkcia na presun položiek na cieľový stôl (virtuálny presun)
function moveItemsToTargetTable(targetTable, itemName, quantity) {
    if (!targetTable) {
        alert("Najprv vyberte cieľový stôl!");
        return;
    }

    // Skontrolujte, či aktuálny stôl existuje a má položky
    if (!tableOrders[currentTable] || !tableOrders[currentTable].items) {
        alert("Aktuálny stôl neexistuje alebo nemá žiadne položky.");
        return;
    }

    const item = tableOrders[currentTable].items[itemName];
    if (!item || item.quantity < quantity) {
        alert("Nedostatok položiek na presun.");
        return;
    }

    // Virtuálny presun položky na cieľový stôl
    if (!itemsToMove[targetTable]) {
        itemsToMove[targetTable] = { items: {}, total: 0 };
    }

    if (itemsToMove[targetTable].items[itemName]) {
        itemsToMove[targetTable].items[itemName].quantity += quantity;
    } else {
        itemsToMove[targetTable].items[itemName] = { ...item, quantity: quantity };
    }
    itemsToMove[targetTable].total += item.price * quantity;

    // Odstránenie iba presunutého množstva z aktuálneho stola (virtuálne)
    item.quantity -= quantity; // Odpočítame presunuté množstvo
    if (item.quantity <= 0) {
        delete tableOrders[currentTable].items[itemName]; // Ak množstvo klesne na 0, odstránime položku
    }

    // Aktualizácia celkovej sumy na aktuálnom stole
    tableOrders[currentTable].total -= item.price * quantity;

    // Aktualizácia modálneho okna
    renderSplitOrderModalContent();
}   

// Funkcia na presun položiek naspäť na pôvodný stôl (virtuálny presun)
function moveItemBackToOriginalTable(itemName, quantity) {
    // Skontrolujte, či cieľový stôl existuje a má položky
    if (!targetTable || !itemsToMove[targetTable] || !itemsToMove[targetTable].items) {
        alert("Cieľový stôl neexistuje alebo nemá žiadne položky.");
        return;
    }

    const item = itemsToMove[targetTable].items[itemName];
    if (!item || item.quantity < quantity) {
        alert("Nedostatok položiek na presun.");
        return;
    }

    // Virtuálny presun položky naspäť na pôvodný stôl
    if (tableOrders[currentTable].items[itemName]) {
        tableOrders[currentTable].items[itemName].quantity += quantity;
    } else {
        tableOrders[currentTable].items[itemName] = { ...item, quantity: quantity };
    }

    // Odstránenie položky z cieľového stola (virtuálne)
    item.quantity -= quantity;
    if (item.quantity <= 0) {
        delete itemsToMove[targetTable].items[itemName];
    }

    // Aktualizácia modálneho okna
    renderSplitOrderModalContent();
}

// Funkcia na vykreslenie obsahu modálneho okna pre rozdelenie objednávky
function renderSplitOrderModalContent() {
    const $modalContent = $("#split-order-modal .modal-content");
    $modalContent.empty();

    // Vytvorenie dvoch stĺpcov
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

    const $targetTableButtons = $columns.find(".target-table-buttons");
    const allTables = menuData.tables.map(table => table.number);

    // Výber stola
    allTables
        .filter(table => table !== currentTable)
        .forEach(table => {
            $targetTableButtons.append(`<button class="target-table-button" data-table="${table}">Stôl ${table}</button>`);
        });

    // Aktuálne položky
    const $currentItemsList = $columns.find(".current-items-list");
    if (tableOrders[currentTable]?.items) {
        // Tu zatiaľ netriedime pre split modal, ale mohli by sme rovnakou logikou
        const sortedItems = Object.entries(tableOrders[currentTable].items)
            .filter(([, item]) => item.quantity > 0)
            .sort((a, b) => {
                const pDiff = getItemPriority(a[1]) - getItemPriority(b[1]);
                if (pDiff !== 0) return pDiff;
                return a[0].localeCompare(b[0], "sk");
            });

        sortedItems.forEach(([itemName, item]) => {

            const $item = $(`
                <div class="split-order-item">
                    <span>${item.quantity}x ${itemName}</span>
                    <div class="move-buttons">
                        <button class="move-item-button" title="Presunúť jeden kus">></button>
                        <button class="move-all-button" title="Presunúť všetky kusy">>></button>
                    </div>
                </div>
            `);

            // Upravené kliknutie na presun jedného/všetkých kusov (virtuálny presun)
            $item.find(".move-item-button").click(() => {
                if (targetTable) moveItemsToTargetTable(targetTable, itemName, 1);
            });
            $item.find(".move-all-button").click(() => {
                if (targetTable) moveItemsToTargetTable(targetTable, itemName, item.quantity);
            });

            $currentItemsList.append($item);
        });
    } else {
        $currentItemsList.append(`<p>Žiadne položky na stole ${currentTable}.</p>`);
    }

    // Aktualizácia presunutých položiek
    const updateMovedItemsList = (targetTable) => {
        const $movedItemsList = $columns.find(".moved-items-list");
        $movedItemsList.empty();
        $targetTableButtons.hide();

        // Aktualizácia čísla cieľového stola
        $columns.find("#target-table-number").text(targetTable ? targetTable : '');

        // Zobrazenie položiek, ktoré sú už na cieľovom stole (reálne položky)
        if (tableOrders[targetTable]?.items) {
            Object.entries(tableOrders[targetTable].items).forEach(([itemName, item]) => {
                const $item = $(`
                    <div class="split-order-item">
                        <span>${item.quantity}x ${itemName}</span>
                    </div>
                `);

                $movedItemsList.append($item);
            });
        }

        // Zobrazenie virtuálne presunutých položiek (s tlačidlami < a <<)
        if (itemsToMove[targetTable]?.items) {
            Object.entries(itemsToMove[targetTable].items).forEach(([itemName, item]) => {
                const $item = $(`
                    <div class="split-order-item">
                        <span>${item.quantity}x ${itemName}</span>
                        <div class="move-buttons">
                            <button class="move-back-button" title="Presunúť jeden kus naspäť"><</button>
                            <button class="move-all-back-button" title="Presunúť všetky kusy naspäť"><<</button>
                        </div>
                    </div>
                `);

                $item.find(".move-back-button").click(() => moveItemBackToOriginalTable(itemName, 1));
                $item.find(".move-all-back-button").click(() => moveItemBackToOriginalTable(itemName, item.quantity));

                $movedItemsList.append($item);
            });
        }

        if ($movedItemsList.children().length === 0) {
            $movedItemsList.append(`<p>Žiadne položky na stole ${targetTable}.</p>`);
        }
    };

    // Výber stola a potvrdenie
    $columns.find(".target-table-button").click(function () {
        targetTable = parseInt($(this).data("table"));
        updateMovedItemsList(targetTable);
    });

    $columns.find(".cancel-split-button").click(() => {
        // Vrátenie všetkých virtuálne presunutých položiek späť na pôvodný stôl
        if (itemsToMove[targetTable]?.items) {
            Object.entries(itemsToMove[targetTable].items).forEach(([itemName, item]) => {
                if (tableOrders[currentTable].items[itemName]) {
                    tableOrders[currentTable].items[itemName].quantity += item.quantity;
                } else {
                    tableOrders[currentTable].items[itemName] = { ...item };
                }
            });
        }

        // Resetovanie stolov a virtuálnych presunov
        currentTable = null;
        targetTable = null;
        itemsToMove = {};

        // Zavretie modálneho okna
        $("#split-order-modal").fadeOut();
    });

    $columns.find(".confirm-split-button").click(() => {
        if (!targetTable) {
            alert("Najprv vyberte cieľový stôl!");
            return;
        }

        // Reálny presun položiek po kliknutí na "Presunúť"
        if (itemsToMove[targetTable]?.items) {
            if (!tableOrders[targetTable]) {
                tableOrders[targetTable] = { items: {}, total: 0 };
            }

            Object.entries(itemsToMove[targetTable].items).forEach(([itemName, item]) => {
                if (tableOrders[targetTable].items[itemName]) {
                    tableOrders[targetTable].items[itemName].quantity += item.quantity;
                } else {
                    tableOrders[targetTable].items[itemName] = { ...item };
                }
                tableOrders[targetTable].total += item.price * item.quantity;
            });

            // Vyčistenie virtuálnych presunov
            itemsToMove = {};
        }

        // Uloženie zmien na backend
        saveOrders();

        // Resetovanie stolov
        currentTable = null;
        targetTable = null;

        $("#split-order-modal").fadeOut();
        updateOrderDisplay();
        updateTableStyles();
    });

    $modalContent.append($columns);
    if (targetTable) updateMovedItemsList(targetTable);
}
// Funkcia pre Zaplatenie objednávky
async function payOrder() {
    if (!currentTable || !tableOrders[currentTable]) {
        alert("Najprv vyberte stôl a pridajte položky do objednávky!");
        return;
    }

    const totalAmount = tableOrders[currentTable].total.toFixed(2);
    const paidOrder = {
        table: currentTable,
        items: tableOrders[currentTable].items,
        total: totalAmount,
        date: new Date().toISOString(), // Aktuálny čas
    };

    try {
        $('#loading-modal').fadeIn(); // Zobrazenie modálneho okna

        // Odoslanie platby na backend
        const response = await fetch(`${BACKEND_URL}/orders/paid`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(paidOrder),
        });

        if (!response.ok) {
            throw new Error(`Chyba pri ukladaní platby: ${response.statusText}`);
        }

        // Úspešná platba - odstránenie objednávky
        delete tableOrders[currentTable];
        saveOrdersToBackend(); // Uloženie aktuálnych objednávok na backend
        $(`.table-button[data-table="${currentTable}"]`).removeClass("has-order");

        // Aktualizácia UI
        $(".current-order h2").text("Vyberte stôl");
        $(".action-buttons button").prop("disabled", true);
        updateOrderDisplay();

        // Načítanie a zobrazenie QR kódu
        const qrResponse = await fetch(
            `${BACKEND_URL}/generate-qr?amount=${totalAmount}&table=${currentTable}`
        );

        if (!qrResponse.ok) {
            throw new Error("Chyba pri generovaní QR kódu.");
        }

        const qrUrl = qrResponse.url;
        $("#qr-code").attr("src", qrUrl); // Nastavenie QR kódu
        $('#loading-modal').fadeOut(); // Zobrazenie modálneho okna
        $("#qr-modal").fadeIn(); // Zobrazenie modálneho okna s QR kódom
    } catch (error) {
        console.error("Chyba pri spracovaní platby:", error);
        alert("Chyba pri spracovaní platby.");
    }
}

// Funkcia pre Zrušenie objednávky
function cancelOrder() {
    if (!currentTable || !tableOrders[currentTable]) return;

    const confirmed = confirm(
        `Naozaj chcete zrušiť objednávku pre stôl ${currentTable}?`
    );
    if (confirmed) {
        delete tableOrders[currentTable];
        saveOrdersToBackend();
        updateOrderDisplay();
        $(`.table-button[data-table="${currentTable}"]`).removeClass("has-order");
        $(".current-order h2").text("Vyberte stôl");
        $(".action-buttons button").prop("disabled", true);
        alert(`Objednávka pre stôl ${currentTable} bola zrušená.`);
    }
}

// Funkcia pre zavretie modálneho okna s QR kódom
function closeQrModal() {
    if (currentTable) {
        $(".action-buttons button").prop("disabled", true);
        $(".current-order h2").text("Vyberte stôl");
        currentTable = null;
        $("#qr-modal").fadeOut(); // Skrytie modálneho okna
    }
}

// Funkcia pre odhlásenie používateľa
function logout() {
    localStorage.removeItem("authToken"); // Zmaže token
    window.location.href = "/POS/login.html"; // Presmerovanie na login
}

// Inicializácia po načítaní stránky
$(document).ready(async function () {
    // Event listener pre výber stola
    $(document).on("click", ".table-button", function () {
        const tableNumber = $(this).data("table");
        
        $(".table-button").removeClass("active");
        $(this).addClass("active");
        currentTable = tableNumber;
        updateOrderDisplay();
        $(".action-buttons button").prop("disabled", false);
        $(".current-order h2").text(`Aktuálna objednávka - Stôl ${tableNumber}`);
    });

    // Event listener pre výber kategórie
    $(document).on("click", ".category-button", function () {
        const selectedCategory = $(this).data("category");
        $(".category-button").removeClass("active");
        $(this).addClass("active");
        $(".menu-item").hide();
        $(`.menu-item[data-category="${selectedCategory}"]`).show();
    });

    // Event listener pre pridanie položky do objednávky
    $(document).on("click", ".menu-item", function () {
        if (!currentTable) {
            alert("Najprv vyberte stôl!");
            return;
        }

        const itemName = $(this).find("h3").text();
        const itemPrice = parseFloat($(this).data("price"));
        // Získanie ID kategórie pre neskoršie triedenie
        const categoryId = $(this).data("category");

        if (!tableOrders[currentTable]) {
            tableOrders[currentTable] = { items: {}, total: 0 };
        }

        if (tableOrders[currentTable].items[itemName]) {
            tableOrders[currentTable].items[itemName].quantity += 1;
            tableOrders[currentTable].total += itemPrice;
            // Aktualizujeme kategoriu pre istotu
            tableOrders[currentTable].items[itemName].category = categoryId;
        } else {
            tableOrders[currentTable].items[itemName] = { 
                price: itemPrice, 
                quantity: 1, 
                category: categoryId // Ukladáme kategóriu
            };
            tableOrders[currentTable].total += itemPrice;
        }

        $(`.table-button[data-table="${currentTable}"]`).addClass("has-order");
        saveOrders(); // Uloženie stavu na backend
        updateOrderDisplay();
    });

    // Event listener pre tlačidlo na rozdelenie objednávky
    $(".split-order-button").click(openSplitOrderModal);

    // Event listener pre tlačidlo Zaplatiť
    $(".pay-button").click(payOrder);

    // Event listener pre tlačidlo Zrušiť
    $(".cancel-button").click(cancelOrder);

    // Event listener pre zavretie modálneho okna s QR kódom
    $("#close-modal").click(closeQrModal);

    // Event listener pre odhlásenie
    $("#logout-button").click(logout);

    // Načítanie údajov po načítaní stránky
    await loadOrdersFromBackend();
    loadMenuData(); // Načítanie menu dát
    updateTableStyles(); // Aktualizácia štýlov stolov
});