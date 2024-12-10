$(document).ready(function () {
    const BACKEND_URL = "https://matodroid.onrender.com"; // URL backendu

    let currentTable = null; // Vybraný stôl
    let tableOrders = {}; // Objednávky pre jednotlivé stoly

    // Funkcia na načítanie menu z backendu
    async function loadMenuData() {
        try {
            $('#loading-data-modal').fadeIn(); // Zobrazenie modálneho okna
    
            const response = await fetch(`${BACKEND_URL}/menu`, {
                method: "GET",
            });
    
            if (!response.ok) {
                throw new Error(`Chyba pri načítaní dát: ${response.status} ${response.statusText}`);
            }
    
            const data = await response.json();
            renderMenuData(data); // Načítanie menu dát
        } catch (error) {
            alert("Nepodarilo sa načítať údaje zo servera.");
            console.error(error);
        } finally {
            $('#loading-data-modal').fadeOut(); // Skrytie modálneho okna
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

        updateTableStyles(); // 
        
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

    // Udalosť pre výber stola
    $(document).on("click", ".table-button", function () {
        const tableNumber = $(this).data("table");
        $(".table-button").removeClass("active");
        $(this).addClass("active");
        currentTable = tableNumber;
        updateOrderDisplay();
        $(".action-buttons button").prop("disabled", false);
        $(".current-order h2").text(`Aktuálna objednávka - Stôl ${tableNumber}`);
    });

    // Udalosť pre výber kategórie a filtrovanie položiek
    $(document).on("click", ".category-button", function () {
        const selectedCategory = $(this).data("category");

        $(".category-button").removeClass("active");
        $(this).addClass("active");

        $(".menu-item").hide();
        $(`.menu-item[data-category="${selectedCategory}"]`).show();
    });

    // Udalosť pre pridanie položky z menu do objednávky
    $(document).on("click", ".menu-item", function () {
        if (!currentTable) {
            alert("Najprv vyberte stôl!");
            return;
        }

        const itemName = $(this).find("h3").text();
        const itemPrice = parseFloat($(this).data("price"));

        if (!tableOrders[currentTable]) {
            tableOrders[currentTable] = { items: {}, total: 0 };
        }

        if (tableOrders[currentTable].items[itemName]) {
            tableOrders[currentTable].items[itemName].quantity += 1;
            tableOrders[currentTable].total += itemPrice;
        } else {
            tableOrders[currentTable].items[itemName] = { price: itemPrice, quantity: 1 };
            tableOrders[currentTable].total += itemPrice;
        }

        $(`.table-button[data-table="${currentTable}"]`).addClass("has-order");
        updateOrderDisplay();
    });

    function updateTableStyles() {
        $(".table-button").removeClass("has-order");
        Object.keys(tableOrders).forEach((table) => {
            $(`.table-button[data-table="${table}"]`).addClass("has-order");
        });
    }
    

    // Zobrazenie objednávok vrátane tlačidiel + a -
    function updateOrderDisplay() {
        const orderItems = $(".order-items");
        orderItems.empty();

        if (!currentTable || !tableOrders[currentTable]) {
            $(".total-section span:last").text("0.00 €");
            return;
        }

        Object.entries(tableOrders[currentTable].items).forEach(([itemName, item]) => {
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
            

            updateOrderDisplay();
    }





        //Upravený kód z povodneho scriptu
        let saveTimeout = null; // Timeout identifikátor pre oneskorené ukladanie

        // Funkcia na uloženie objednávok na backend
         async function saveOrdersToBackend() {
            if (saveTimeout) {
                clearTimeout(saveTimeout); // Vyčistenie predchádzajúceho timeoutu
            }
        
            saveTimeout = setTimeout(async () => {
                try {
                    const cleanedOrders = Object.fromEntries(
                        Object.entries(tableOrders).filter(([_, value]) => value && Object.keys(value.items || {}).length > 0)
                    );
        
                    const dataToSave = Object.keys(cleanedOrders).length === 0 ? { empty: true } : cleanedOrders;
        
                    console.log("Odosielané údaje na backend:", JSON.stringify(dataToSave));
        
                    const response = await fetch("https://matodroid.onrender.com/orders", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(dataToSave),
                    });
        
                    if (response.ok) {
                        console.log("Objednávky úspešne uložené na backend.");
                    } else {
                        console.error("Chyba pri ukladaní objednávok na backend:", response.statusText);
                    }
                } catch (error) {
                    console.error("Chyba pri ukladaní objednávok na backend:", error);
                }
            }, 2500); // Oneskorenie 2500 ms = 2.5 sekundy
        }

        
        // Volanie funkcie na uloženie objednávky po zmene
        function saveOrders() {
            saveOrdersToBackend();
        }
        
        // Funkcia na načítanie objednávok z backendu
        async function loadOrdersFromBackend() {
            try {
                const response = await fetch("https://matodroid.onrender.com/orders", {
                    method: "GET",
                });
                if (response.ok) {
                    const data = await response.json();
                    tableOrders = data || {};
                    console.log("Objednávky načítané z backendu:", tableOrders);
                } else {
                    console.error("Chyba pri načítaní objednávok z backendu:", response.statusText);
                }
            } catch (error) {
                console.error("Chyba pri načítaní objednávok z backendu:", error);
            }
        }
        
        // Volanie funkcie na načítanie objednávok pri načítaní stránky
        $(document).ready(async function () {
            await loadOrdersFromBackend();
            loadMenuData(); // Načítanie menu dát
            updateTableStyles(); // Aktualizácia štýlov stolov
        });
        

        
        
    
    

        // Tlačidlo Zaplatiť
        $(".pay-button").click(async function () {
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
        });
        
        // Tlačidlo pre zavretie modálneho okna s QR kódom
        $("#close-modal").click(function () {
            if (currentTable) {
                $(".action-buttons button").prop("disabled", true);
                $(".current-order h2").text("Vyberte stôl");
                currentTable = null;
                $("#qr-modal").fadeOut(); // Skrytie modálneho okna
            }
        });
        
    
        // Tlačidlo Zrušiť
        $(".cancel-button").click(function () {
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
        });
    

    // Načítanie menu po načítaní stránky
    loadMenuData();
});
