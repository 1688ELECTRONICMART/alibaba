// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDvzRnxMv6FMZdx0obAZUAIUyTQtu1A-90",
    authDomain: "electronic-mart-1688.firebaseapp.com",
    databaseURL: "https://electronic-mart-1688-default-rtdb.firebaseio.com",
    projectId: "electronic-mart-1688",
    storageBucket: "electronic-mart-1688.firebasestorage.app",
    messagingSenderId: "988016654865",
    appId: "1:988016654865:web:e3afa29c54cc8a2b6f0fb0"
};

// --- INITIALIZATION & GLOBAL VARIABLES ---
let db, rtdb, auth, provider;

if (typeof firebase === 'undefined') {
    console.error("Firebase SDK failed to load. Operating in offline mode.");
    var firebaseMock = {
        initializeApp: () => ({}),
        firestore: () => ({ collection: () => ({ onSnapshot: () => ({}), doc: () => ({ onSnapshot: () => ({}), update: () => Promise.resolve() }) }) }),
        database: () => ({ ref: () => ({ on: () => ({}), once: () => Promise.resolve({ val: () => ({}) }), set: () => Promise.resolve(), update: () => Promise.resolve() }) }),
        auth: () => ({ onAuthStateChanged: () => ({}), signOut: () => Promise.resolve(), setPersistence: () => Promise.resolve() })
    };
    db = firebaseMock.firestore();
    rtdb = firebaseMock.database();
    auth = firebaseMock.auth();
} else {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    rtdb = firebase.database();
    auth = firebase.auth();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => console.error("Persistence Error:", e));
    provider = new firebase.auth.GoogleAuthProvider();
}

const storage = {
    get: (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } },
    set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
};

let currentUser = null;
let userData = null;
let deferredPrompt = null;
let shopConfig = { name: "1688 Electronic Mart", location: "Shenzhen, China", rating: 4.8 };
let mockProducts = storage.get('cache_products', []);
let featuredAds = storage.get('cache_adverts', []);
let mockCategories = storage.get('cache_categories', [
    { id: 'c1', name: 'Phone', icon: 'fa-mobile-alt' },
    { id: 'c2', name: 'Electronics', icon: 'fa-bolt' },
    { id: 'c3', name: 'Instrument', icon: 'fa-microchip' },
    { id: 'c4', name: 'Vehicle', icon: 'fa-car' },
    { id: 'c5', name: 'Laptops', icon: 'fa-laptop' }
]);
const userChats = storage.get('cache_chats', []);
let cart = storage.get('cart', []);
let selectedCartItems = new Set(storage.get('selectedCartItems', []));
let favorites = storage.get('favorites', []);
let footprints = storage.get('footprints', []);
let recentSearches = storage.get('recentSearches', []);
let addresses = storage.get('addresses', []);
let profileImage = storage.get('profileImage', null);
let addressFormState = { mode: 'new', id: null };

// --- AUDIO ---
const msgSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
function playNotificationSound() { try { msgSound.play().catch(e => console.warn("Sound blocked:", e)); } catch(e) {} }

// --- HELPERS ---
function cloudinaryOptimize(url, width = null) {
    if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url;
    const parts = url.split('/upload/');
    if (parts.length !== 2) return url;
    let transformations = 'f_auto,q_auto';
    if (width) transformations += `,w_${width},c_limit`;
    return `${parts[0]}/upload/${transformations}/${parts[1]}`;
}

function renderThumbImage(imgSrcOrIcon, className = '') {
    if (!imgSrcOrIcon) return `<i class="fas fa-image ${className}"></i>`;
    const rawSrc = String(imgSrcOrIcon).trim();
    if (rawSrc.startsWith('http') || rawSrc.startsWith('data:') || rawSrc.includes('/')) {
        return `<img src="${cloudinaryOptimize(rawSrc, 300)}" class="${className}" alt="Product" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\"fas fa-image ${className}\"></i>';">`;
    }
    return `<i class="fas ${rawSrc.startsWith('fa-') ? rawSrc : 'fa-' + rawSrc} ${className}"></i>`;
}

function showNotificationToast(title, body) {
    let container = document.querySelector('.toast-container') || document.createElement('div');
    if (!container.parentElement) { container.className = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<div class="toast-icon"><i class="fas fa-bullhorn"></i></div><div class="toast-content"><h4>${title}</h4><p>${body}</p></div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(-20px)'; toast.style.transition = 'opacity 0.3s, transform 0.3s'; setTimeout(() => toast.remove(), 300); }, 5000);
}

function saveData() {
    storage.set('cart', cart);
    storage.set('selectedCartItems', Array.from(selectedCartItems));
    storage.set('favorites', favorites);
    storage.set('footprints', footprints);
    storage.set('recentSearches', recentSearches);
    storage.set('addresses', addresses);
    storage.set('cache_products', mockProducts);
    storage.set('cache_adverts', featuredAds);
    storage.set('cache_categories', mockCategories);
}

// --- PAGE DEFINITIONS ---
const pages = {
    home: (searchQuery = '', filterCategory = null, sortBy = 'default') => {
        const query = (searchQuery || '').toLowerCase().trim();
        const products = Array.isArray(mockProducts) ? mockProducts : [];
        const ads = Array.isArray(featuredAds) ? featuredAds : [];
        const cats = Array.isArray(mockCategories) ? mockCategories : [];
        let filteredProducts = products.filter(p => {
            const name = String(p.name || p.title || '').toLowerCase();
            const company = String(p.company || '').toLowerCase();
            return (name.includes(query) || company.includes(query)) && (filterCategory ? p.category === filterCategory : true);
        });
        if (sortBy === 'low') filteredProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
        else if (sortBy === 'high') filteredProducts.sort((a, b) => (b.price || 0) - (a.price || 0));

        return `
        <section class="home-page page-enter">
            <div id="search-history-container" class="search-history-dropdown" style="display: none;">
                <div class="history-header"><span>Recent Searches</span><button class="clear-history-btn">Clear</button></div>
                <div class="history-tags">${(recentSearches || []).map(s => `<button class="history-tag" onclick="document.getElementById('search-input').value='${s}'; navigate('home', '${s}')">${s}</button>`).join('')}</div>
            </div>
            <div class="promo-carousel" style="${ads.length === 0 ? 'display:none' : ''}">
                ${ads.map((ad, i) => `
                    <div class="carousel-slide ${i === 0 ? 'active' : ''}" data-ad-id="${ad.id}" style="${ad.imageUrl ? `background-image: linear-gradient(135deg, rgba(255, 106, 0, 0.8), rgba(219, 75, 0, 0.9)), url('${cloudinaryOptimize(ad.imageUrl, 1000)}');` : `background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));`} background-size: cover; background-position: center; cursor: pointer;">
                        <div class="carousel-content"><h2>${ad.title || 'Special Promotion'}</h2><p>${ad.short || ad.link || 'Quality components and electronics'}</p></div>
                        ${ad.imageUrl ? `<img src="${cloudinaryOptimize(ad.imageUrl, 100)}" alt="Promo" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-left: auto; border: 2px solid rgba(255,255,255,0.7);">` : `<i class=\"fas ${ad.icon || 'fa-rectangle-ad'} fa-3x\" style=\"margin-left: auto; opacity: 0.3;\"></i>`}
                    </div>
                `).join('')}
                ${ads.length > 1 ? `<div class=\"carousel-indicators\">${ads.map((_, i) => `<span class=\"indicator-dot ${i === 0 ? 'active' : ''}\"></span>`).join('')}</div>` : ''}
            </div>
            <div class=\"category-grid\">${cats.map(cat => `<div class=\"category-item\" onclick=\"navigate('home', '', '${cat.name}')\"><div class=\"category-icon\"><i class=\"fas ${cat.icon}\"></i></div><span>${cat.name}</span></div>`).join('')}</div>
            <div class=\"home-filters\"><div class=\"section-title\">${filterCategory || 'Recommended'}</div><select class=\"sort-select\" onchange=\"navigate('home', '', '${filterCategory || ''}', this.value)\"><option value=\"default\" ${sortBy === 'default' ? 'selected' : ''}>Default</option><option value=\"low\" ${sortBy === 'low' ? 'selected' : ''}>Price: Low to High</option><option value=\"high\" ${sortBy === 'high' ? 'selected' : ''}>Price: High to Low</option></select></div>
            <div class=\"home-section\" id=\"recommended-section\">
                ${filteredProducts.length === 0 ? `<div class=\"empty-state\" style=\"padding: 60px 20px; text-align: center; color: #ccc;\"><i class=\"fas fa-box-open fa-4x\" style=\"margin-bottom: 20px; opacity: 0.5;\"></i><p style=\"font-weight: 600; color: #999;\">${searchQuery ? `No matching products for \"${searchQuery}\"` : 'Your electronic mart is ready.'}</p></div>` : `
                <div class=\"product-grid\">${filteredProducts.map((p, i) => `
                    <button class=\"product-card stagger-item\" type=\"button\" data-product-id=\"${p.id}\" data-item-type=\"prod\" style=\"animation-delay: ${i * 0.1}s\">
                        <div class=\"fav-overlay ${favorites.some(f => String(f.id) === String(p.id)) ? 'active' : ''}\" data-fav-id=\"${p.id}\" data-fav-type=\"prod\"><i class=\"fas fa-heart\"></i></div>
                        <div class=\"product-img\">${renderThumbImage((p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || p.image || p.icon))}</div>
                        <div class=\"product-info\"><div class=\"condition-badge ${String(p.condition || 'New').toLowerCase().includes('new') ? 'new' : 'used'}\">${p.condition || 'New'}</div><div class=\"product-name\">${p.name || p.title || 'Product'}</div><div class=\"product-price\">¥${Number(p.price || 0).toFixed(2)}</div><div class=\"product-company\">${p.company || 'Electronics Supplier'}</div></div>
                    </button>`).join('')}</div>`}
            </div>
        </section>`;
    },
    cart: () => {
        if (cart.length === 0) return `<div class=\"empty-state page-enter\"><i class=\"fas fa-shopping-cart\"></i><p>Your cart is empty</p><button class=\"go-shopping\" type=\"button\">Go Sourcing</button></div>`;
        const selectedList = cart.filter(item => selectedCartItems.has(String(item.id)));
        const total = selectedList.reduce((sum, item) => sum + (item.price || 0), 0);
        return `<div class=\"cart-page page-enter\"><div class=\"section-title\">My Cart (${cart.length})</div><div class=\"cart-list\">${cart.map(item => `<div class=\"cart-item\"><input type=\"checkbox\" class=\"cart-checkbox\" ${selectedCartItems.has(String(item.id)) ? 'checked' : ''} onchange=\"toggleCartItem('${item.id}')\"><div class=\"cart-item-img\">${renderThumbImage(item.images && item.images.length > 0 ? item.images[0] : (item.imageUrl || item.image || item.icon))}</div><div class=\"cart-item-info\"><div class=\"cart-item-name\">${item.title || item.name}</div><div class=\"cart-item-price\">¥${Number(item.price || 0).toFixed(2)}</div></div><button class=\"remove-btn\" type=\"button\" data-remove-id=\"${item.id}\"><i class=\"fas fa-trash\"></i></button></div>`).join('')}</div><div class=\"cart-footer\"><div class=\"cart-total\"><span>Selected (${selectedList.length}):</span><span>¥${total.toFixed(2)}</span></div><button class=\"checkout-btn ${selectedList.length === 0 ? 'disabled' : ''}\" type=\"button\" onclick=\"${selectedList.length > 0 ? 'checkout()' : ''}\">Checkout</button></div></div>`;
    },
    message: () => {
        if (!currentUser) return `<div class=\"message-page page-enter\"><div class=\"empty-state\" style=\"padding-top: 100px;\"><i class=\"fas fa-comments\"></i><p>Sign in to view your messages</p><button class=\"primary-btn\" onclick=\"navigate('profile')\" style=\"margin-top: 20px;\">Go to Profile</button></div></div>`;
        return `<div class=\"message-page page-enter\"><div class=\"section-title\">Messages</div><div class=\"chat-list\">${userChats.length === 0 ? '<p class=\"empty-state\">No messages yet.</p>' : userChats.map(msg => `<div class=\"chat-item\" data-chat-id=\"${msg.id}\"><div class=\"chat-avatar\"><i class=\"fas ${msg.userAvatar || 'fa-user'}\"></i></div><div class=\"chat-info\"><div class=\"chat-header\"><span class=\"chat-name\">${msg.userName}</span><span class=\"chat-time\">${msg.lastTime}</span></div><div class=\"chat-snippet\">${msg.lastMessage}</div></div>${msg.userUnreadCount > 0 ? `<div class=\"unread-dot\">${msg.userUnreadCount}</div>` : ''}</div>`).join('')}</div></div>`;
    },
    chat: (chatId) => {
        const chat = userChats.find(m => m.id === chatId);
        if (!chat) return navigate('message');
        return `<div class=\"chat-window page-enter\"><div class=\"chat-window-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"message\"><i class=\"fas fa-arrow-left\"></i></button><div class=\"chat-window-title\"><div class=\"chat-avatar mini\"><i class=\"fas ${chat.userAvatar || 'fa-user'}\"></i></div><span>${chat.userName}</span></div></div><div class=\"chat-body\" id=\"chat-body\">${chat.messages.map(m => `<div class=\"msg-bubble ${m.senderRole === 'user' ? 'me' : 'them'}\">${m.invoiceId ? `<div class=\"invoice-card\"><div class=\"invoice-card-header\"><i class=\"fas fa-file-invoice-dollar\"></i><div><strong>Proforma Invoice</strong><small>${m.invoiceId}</small></div></div><button class=\"view-invoice-btn\" onclick=\"openInvoiceModal('${m.invoiceId}')\">View Invoice</button></div>` : `${m.attachmentUrl ? `<div class=\"msg-attachment\"><img src=\"${cloudinaryOptimize(m.attachmentUrl, 400)}\" alt=\"Product\"></div>` : ''}<div class=\"msg-text\">${m.text}</div>`}<div class=\"msg-time\">${m.time}</div></div>`).join('')}</div><div class=\"chat-footer\"><input type=\"text\" id=\"chat-input\" placeholder=\"Type a message...\"><button class=\"send-btn\" onclick=\"sendRealMessage('${chat.id}')\"><i class=\"fas fa-paper-plane\"></i></button></div></div>`;
    },
    profile: () => {
        if (!currentUser) return `<div class=\"profile-page page-enter\"><div style=\"text-align: center; padding: 60px 20px;\"><img src=\"https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/a4/6a/06/a46a0662-72a3-2c1b-b184-7a1b8e1a1a6a/AppIcon-0-0-1x_U007emarketing-0-7-0-sRGB-85-220.png/512x512bb.jpg\" style=\"width: 100px; height: 100px; border-radius: 20px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);\"><h2>Welcome to 1688</h2><p style=\"color: var(--light-text); margin-bottom: 30px;\">Sign in to manage your orders, favorites, and chat with suppliers.</p><button class=\"google-signin-btn\" onclick=\"signInWithGoogle()\"><img src=\"https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_\\\"G\\\" logo.svg\" alt=\"Google logo\" class=\"google-icon-img\"><span>Continue with Google</span></button></div></div>`;
        return `<div class=\"profile-page page-enter\"><header class=\"profile-header-premium\" style=\"background: #333;\"><div class=\"avatar-container\"><div class=\"profile-avatar-premium profile-avatar-image-container\">${currentUser.photoURL ? `<img class=\"profile-user-image\" src=\"${currentUser.photoURL}\" alt=\"Profile avatar\">` : `<i class=\"fas fa-user fa-2x\"></i>`}</div></div><div class=\"profile-info-premium\"><h2>${currentUser.displayName || 'Member'}</h2><p style=\"color: rgba(255,255,255,0.7); font-size: 12px;\">${currentUser.email}</p></div></header><section class=\"profile-card-group\"><div class=\"section-title\" style=\"margin: 15px 16px 5px;\">Business Profile</div><div id=\"business-info-section\" style=\"padding: 16px; background: white; margin: 0 16px 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);\">${renderBusinessInfoContent()}</div><div class=\"service-list\">${deferredPrompt ? `<div class=\"service-item install-prompt-item\" onclick=\"installPWA()\" style=\"background: #fff4e6; border: 1px solid #ffe8cc;\"><div class=\"service-item-left\"><i class=\"fas fa-download\" style=\"color: #ff6000;\"></i><span style=\"color: #ff6000; font-weight: 700;\">Install Web Application</span></div><i class=\"fas fa-arrow-alt-circle-down\" style=\"color: #ff6000;\"></i></div>` : ''}<div class=\"service-item\" data-service=\"favorites\"><div class=\"service-item-left\"><i class=\"fas fa-heart\" style=\"color: #ff4d4f;\"></i><span>My Favorites</span></div><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\" data-service=\"footprints\"><div class=\"service-item-left\"><i class=\"fas fa-history\" style=\"color: #1890ff;\"></i><span>Browsing History</span></div><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\" data-service=\"address\"><div class=\"service-item-left\"><i class=\"fas fa-map-marker-alt\"></i><span>Shipping Address</span></div><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\" data-service=\"security\"><div class=\"service-item-left\"><i class=\"fas fa-user-shield\"></i><span>Security Center</span></div><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\" data-service=\"help\"><div class=\"service-item-left\"><i class=\"fas fa-headset\"></i><span>Help & Customer Service</span></div><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\" data-service=\"about\"><div class=\"service-item-left\"><i class=\"fas fa-info-circle\"></i><span>About 1688 Electronic Mart</span></div><i class=\"fas fa-chevron-right chevron\"></i></div></div></section><div class=\"logout-container\"><button class=\"logout-btn\" type=\"button\" onclick=\"logout()\">Log Out</button></div></div>`;
    },
    orders: (status) => {
        const filtered = status === 'all' ? mockOrders : mockOrders.filter(o => o.status === status);
        const labels = { all: 'All Orders', unpaid: 'Pending Payment', to_ship: 'To Ship', to_receive: 'To Receive', to_review: 'To Review', refund: 'Refund/After-sale' };
        return `<div class=\"orders-page page-enter\"><div class=\"orders-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"profile\"><i class=\"fas fa-arrow-left\"></i>Back</button><div class=\"section-title\">${labels[status] || 'My Orders'}</div></div>${filtered.length === 0 ? `<div class=\"empty-state\"><i class=\"fas fa-clipboard-list\"></i><p>No orders found in this category.</p></div>` : `<div class=\"orders-list\">${filtered.map(order => `<div class=\"order-item\"><div class=\"order-item-header\"><span>Order ID: ${order.id}</span><span class=\"order-status-tag status-${order.status}\">${order.status.replace('_', ' ')}</span></div><div class=\"order-item-content\"><div class=\"order-item-img\"><i class=\"fas ${order.icon}\"></i></div><div class=\"order-item-info\"><div class=\"order-item-name\">${order.name}</div><div class=\"order-item-price\">¥${Number(order.price || 0).toFixed(2)}</div></div></div><div class=\"order-item-footer\"><span class=\"order-date\">${order.date}</span><div class=\"order-actions\"><button class=\"mini-btn\" type=\"button\">Details</button>${order.status === 'unpaid' ? '<button class=\"mini-btn highlight\" type=\"button\">Pay Now</button>' : ''}</div></div></div>`).join('')}</div>`}</div>`;
    },
    address: () => `<div class=\"service-page page-enter\"><div class=\"orders-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"profile\"><i class=\"fas fa-arrow-left\"></i>Back</button><div class=\"section-title\">Shipping Address</div></div><div class=\"address-list\">${addresses.length === 0 ? '<div class=\"empty-state\"><i class=\"fas fa-map-marker-alt\"></i><p>No addresses saved yet.</p></div>' : addresses.map((address, index) => `<div class=\"address-item ${index === 0 ? 'active' : ''}\"><div class=\"address-header\"><span class=\"name\">${address.name}</span><span class=\"phone\">${address.phone}</span></div><div class=\"address-content\"><div class=\"address-label\">${address.label}</div><div>${address.address}</div><div>${address.city}, ${address.district}, ${address.postcode}</div></div><div class=\"address-footer\"><span class=\"default-tag\">${index === 0 ? 'Default' : 'Saved'}</span><div class=\"address-actions\"><button class=\"mini-btn edit-address\" type=\"button\" data-address-id=\"${address.id}\">Edit</button><button class=\"mini-btn delete-address\" type=\"button\" data-address-id=\"${address.id}\">Delete</button></div></div></div>`).join('')}<button class=\"add-address-btn\" type=\"button\">+ Add New Address</button>${renderAddressForm()}</div></div>`,
    security: () => `<div class=\"service-page page-enter\"><div class=\"orders-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"profile\"><i class=\"fas fa-arrow-left\"></i>Back</button><div class=\"section-title\">Security Center</div></div><div class=\"service-list profile-card-group\"><div class=\"service-item\"><span>Modify Password</span><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\"><span>Binding Phone</span><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\"><span>Payment Security</span><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item delete-account-item\" style=\"margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px;\"><span style=\"color: #ff4d4f; font-weight: bold;\">Delete Account Permanently</span><i class=\"fas fa-chevron-right chevron\"></i></div></div></div>`,
    help: () => `<div class=\"service-page page-enter\"><div class=\"orders-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"profile\"><i class=\"fas fa-arrow-left\"></i>Back</button><div class=\"section-title\">Help & Customer Service</div></div><div class=\"help-section\"><div class=\"help-search\"><i class=\"fas fa-search\"></i><input type=\"text\" placeholder=\"How can we help you?\"></div><div class=\"faq-list profile-card-group\"><div class=\"service-item\"><span>How to track my order?</span><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\"><span>Refund policy</span><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\"><span>Contacting the supplier</span><i class=\"fas fa-chevron-right chevron\"></i></div></div><button class=\"contact-btn\">Live Chat Support</button></div></div>`,
    about: () => `<div class=\"service-page page-enter\"><div class=\"orders-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"profile\"><i class=\"fas fa-arrow-left\"></i>Back</button><div class=\"section-title\">About Us</div></div><div class=\"about-content\"><div class=\"about-logo\"><div class=\"profile-avatar-premium\" style=\"margin: 0 auto 15px; background: var(--primary-color); color: white;\"><i class=\"fas fa-store fa-2x\"></i></div><h3 style=\"text-align: center;\">1688 Electronic Mart</h3><p style=\"text-align: center; color: var(--light-text); font-size: 12px;\">Version 2.0.4</p></div><div class=\"service-list profile-card-group\" style=\"margin-top: 30px;\"><div class=\"service-item\"><span>Terms of Service</span><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\"><span>Privacy Policy</span><i class=\"fas fa-chevron-right chevron\"></i></div><div class=\"service-item\"><span>Official Website</span><i class=\"fas fa-chevron-right chevron\"></i></div></div></div></div>`,
    followed: () => `<div class=\"followed-page page-enter\"><div class=\"orders-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"profile\"><i class=\"fas fa-arrow-left\"></i>Back</button><div class=\"section-title\">Followed Shops</div></div><div class=\"shop-list\">${followedShops.map(shop => `<div class=\"shop-card\"><div class=\"shop-icon\"><i class=\"fas ${shop.icon}\"></i></div><div class=\"shop-info\"><div class=\"shop-name\">${shop.name}</div><div class=\"shop-meta\"><span><i class=\"fas fa-star\" style=\"color:#faad14\"></i> ${shop.rating}</span><span>${shop.products} Products</span></div><div class=\"shop-location\">${shop.location}, China</div></div><button class=\"enter-shop-btn\" onclick=\"document.getElementById('search-input').value='${shop.name.split(' ')[0]}'; navigate('home', '${shop.name.split(' ')[0]}')\">Enter</button></div>`).join('')}</div></div>`,
    'checkout-success': (boughtItems = []) => `<div class=\"success-page page-enter\"><div class=\"success-icon\"><i class=\"fas fa-check-circle\"></i></div><h1>Order Successful!</h1><p>Your payment for ${boughtItems.length} item(s) has been processed.</p><div class=\"bought-summary\">${boughtItems.map(item => `<div class=\"summary-item\"><div style=\"width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 6px; margin-right: 10px; background: #f4f4f4; flex-shrink: 0;\">${renderThumbImage(item.images && item.images.length > 0 ? item.images[0] : (item.imageUrl || item.image || item.icon))}</div><span>${item.title || item.name}</span></div>`).join('')}</div><div class=\"order-id\">Transaction ID: TXN-${Math.floor(Math.random() * 1000000)}</div><button class=\"primary-btn go-home-btn\" type=\"button\">Continue Sourcing</button></div>`,
    favorites: () => `<div class=\"favorites-page page-enter\"><div class=\"orders-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"profile\"><i class=\"fas fa-arrow-left\"></i>Back</button><div class=\"section-title\">My Favorites (${favorites.length})</div></div>${favorites.length === 0 ? `<div class=\"empty-state\"><i class=\"fas fa-heart\"></i><p>No favorites yet.</p></div>` : `<div class=\"product-grid\">${favorites.map((p, i) => `<button class=\"product-card stagger-item\" type=\"button\" data-product-id=\"${p.id}\" data-item-type=\"${p.type || 'prod'}\"><div class=\"fav-overlay active\" data-fav-id=\"${p.id}\" data-fav-type=\"${p.type || 'prod'}\"><i class=\"fas fa-heart\"></i></div><div class=\"product-img\">${renderThumbImage((p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || p.image || p.icon))}</div><div class=\"product-info\"><div class=\"condition-badge ${String(p.condition || 'New').toLowerCase().includes('new') ? 'new' : 'used'}\">${p.condition || 'New'}</div><div class=\"product-name\">${p.name || p.title || 'Product'}</div><div class=\"product-price\">¥${Number(p.price || 0).toFixed(2)}</div><div class=\"product-company\">${p.company || 'Electronics Supplier'}</div></div></button>`).join('')}</div>`}</div>`,
    footprints: () => `<div class=\"footprints-page page-enter\"><div class=\"orders-header\"><button class=\"back-button\" type=\"button\" data-nav-back=\"profile\"><i class=\"fas fa-arrow-left\"></i>Back</button><div class=\"section-title\">Browsing History (${footprints.length})</div></div>${footprints.length === 0 ? `<div class=\"empty-state\"><i class=\"fas fa-history\"></i><p>No browsing history yet.</p></div>` : `<div class=\"product-grid\">${footprints.map((p, i) => `<button class=\"product-card stagger-item\" type=\"button\" data-product-id=\"${p.id}\" data-item-type=\"${p.type || 'prod'}\"><div class=\"fav-overlay active\" data-fav-id=\"${p.id}\" data-fav-type=\"${p.type || 'prod'}\"><i class=\"fas fa-heart\"></i></div><div class=\"product-img\">${renderThumbImage((p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || p.image || p.icon))}</div><div class=\"product-info\"><div class=\"condition-badge ${String(p.condition || 'New').toLowerCase().includes('new') ? 'new' : 'used'}\">${p.condition || 'New'}</div><div class=\"product-name\">${p.name || p.title || 'Product'}</div><div class=\"product-price\">¥${Number(p.price || 0).toFixed(2)}</div><div class=\"product-company\">${p.company || 'Electronics Supplier'}</div></div></button>`).join('')}</div>`}</div>`
};

// --- NAVIGATION & ROUTING ---
function updateActiveNav(pageId) {
    const profileSubPages = ['orders', 'address', 'security', 'help', 'about', 'favorites', 'footprints', 'followed'];
    const targetPage = (pageId === 'advert-detail' || pageId === 'product-detail' || pageId === 'checkout-success') ? 'home' : (profileSubPages.includes(pageId) ? 'profile' : pageId);
    document.querySelectorAll('.nav-item').forEach(item => { item.classList.remove('active'); if (item.dataset.page === targetPage) item.classList.add('active'); });
}

function navigate(pageId, itemId = null, category = null, sortBy = 'default', updateUrl = true) {
    const content = document.getElementById('app-content');
    if (!content) return;
    const mainHeader = document.querySelector('.header');
    const bottomNav = document.querySelector('.bottom-nav');

    if (updateUrl) {
        let hash = `#/${pageId}`; if (itemId) hash += `/${itemId}`;
        const params = new URLSearchParams(); if (category) params.set('cat', category); if (sortBy !== 'default') params.set('sort', sortBy);
        const pStr = params.toString(); if (pStr) hash += `?${pStr}`;
        window.history.pushState(null, null, hash);
    }
    document.body.classList.remove('chat-mode');
    if (pageId === 'chat') { mainHeader.style.setProperty('display', 'none', 'important'); bottomNav.style.setProperty('display', 'none', 'important'); document.body.style.paddingBottom = '0'; document.body.classList.add('chat-mode'); }
    else { mainHeader.style.display = 'block'; bottomNav.style.display = 'flex'; document.body.style.paddingBottom = '60px'; }

    const isTab = ['home', 'cart', 'message', 'profile'].includes(pageId) && !itemId && !category && sortBy === 'default';
    if (isTab && (!content.innerHTML || content.innerHTML.length < 100)) content.innerHTML = `<div class=\"loading-container\"><div class=\"spinner\"></div></div>`;

    content.style.opacity = '0'; content.style.transform = 'translateY(10px)'; content.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    setTimeout(() => {
        try {
            if (pageId === 'chat') content.style.transform = 'none';
            if (pageId === 'advert-detail' && itemId) { trackFootprint(itemId, 'ad'); content.innerHTML = renderAdvertDetail(itemId); }
            else if (pageId === 'product-detail' && itemId) { trackFootprint(itemId, 'prod'); content.innerHTML = renderProductDetail(itemId); }
            else if (pageId === 'home') content.innerHTML = pages.home(itemId || '', category, sortBy);
            else if (pageId === 'chat' && itemId) content.innerHTML = pages.chat(itemId);
            else if (pages[pageId]) content.innerHTML = pages[pageId]();
        } catch (e) { console.error("Navigation Error:", e); content.innerHTML = `<div class=\"empty-state\"><p>Something went wrong. Please refresh.</p></div>`; }
        content.style.opacity = '1'; if (pageId !== 'chat') content.style.transform = 'translateY(0)';
        updateActiveNav(pageId);
    }, isTab ? 600 : 200);
}

function handleRouting() {
    const hash = window.location.hash || '#/home';
    const [pathPart, queryPart] = hash.replace('#/', '').split('?');
    const segments = pathPart.split('/');
    const pageId = segments[0] || 'home';
    const itemId = segments[1] || null;
    const params = new URLSearchParams(queryPart || '');
    navigate(pageId, itemId, params.get('cat'), params.get('sort') || 'default', false);
}

// --- UPDATE LOGIC ---
function checkUpdate(data) {
    if (!data || !data.last_updated_at) return;
    const lastApplied = storage.get('last_applied_version', 0);
    if (data.last_updated_at > lastApplied) applyHotPatch(data);
}

function applyHotPatch(data) {
    const isForce = data.force_reload;
    const ver = data.last_updated_at;
    storage.set('last_applied_version', ver);
    showNotificationToast(isForce ? "Critical Update" : "System Update", isForce ? "Refreshing to latest version..." : "Applying improvements...");
    const progress = document.createElement('div'); progress.className = 'update-progress'; document.body.appendChild(progress);
    setTimeout(() => progress.style.width = '100%', 50);
    if (isForce) {
        setTimeout(() => { if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' }); setTimeout(() => { const url = new URL(window.location.href); url.searchParams.set('v', ver); window.location.href = url.toString(); }, 1000); }, 1000);
        return;
    }
    const links = document.getElementsByTagName('link'); for (let link of links) { if (link.rel === 'stylesheet' && link.href.includes('style.css')) { link.href = 'style.css?v=' + ver; break; } }
    if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'HOT_PATCH', version: ver });
    navigator.serviceWorker.ready.then(reg => reg.update());
    setTimeout(() => { handleRouting(); setTimeout(() => progress.remove(), 500); }, 1500);
}

// --- CORE UI FUNCTIONS ---
function renderProfilePageIfActive() {
    const content = document.getElementById('app-content');
    if (content && content.querySelector('.profile-page')) content.innerHTML = pages.profile();
}
window.installPWA = async function() { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; renderProfilePageIfActive(); };
function signInWithGoogle() { auth.signInWithPopup(provider).catch(e => { console.error("Auth Error:", e); alert("Failed to sign in with Google."); }); }
function logout() { if (confirm('Log out?')) auth.signOut().then(() => { localStorage.clear(); location.reload(); }); }
function renderBusinessInfoContent() {
    if (!userData) return '<p class=\"empty-state\">Loading business info...</p>';
    return `<div class=\"business-info-fields\" style=\"display: flex; flex-direction: column; gap: 15px;\"><div class=\"form-group\"><label>Company Name</label><input type=\"text\" id=\"biz-company\" value=\"${userData.companyName || ''}\" placeholder=\"e.g. Acme Ltd\"></div><div class=\"form-group\"><label>Business Type</label><select id=\"biz-type\"><option value=\"\" ${!userData.businessType ? 'selected' : ''}>Select Type</option><option value=\"Manufacturer\" ${userData.businessType === 'Manufacturer' ? 'selected' : ''}>Manufacturer</option><option value=\"Wholesaler\" ${userData.businessType === 'Wholesaler' ? 'selected' : ''}>Wholesaler</option><option value=\"Retailer\" ${userData.businessType === 'Retailer' ? 'selected' : ''}>Retailer</option></select></div><button class=\"primary-btn highlight\" onclick=\"saveBusinessInfo()\">Save Business Info</button></div>`;
}
function saveBusinessInfo() { if (!currentUser) return; db.collection(\"users\").doc(currentUser.uid).update({ companyName: document.getElementById('biz-company').value, businessType: document.getElementById('biz-type').value }).then(() => showNotificationToast(\"Success\", \"Profile updated!\")).catch(e => alert(e.message)); }
function toggleCartItem(itemId) { const id = String(itemId); if (selectedCartItems.has(id)) selectedCartItems.delete(id); else selectedCartItems.add(id); saveData(); const content = document.getElementById('app-content'); if (content.querySelector('.cart-page')) content.innerHTML = pages.cart(); }
function toggleFavorite(itemId, type) { const strId = String(itemId); const isFav = favorites.some(f => String(f.id) === strId); if (isFav) favorites = favorites.filter(f => String(f.id) !== strId); else { const item = (type === 'ad' ? featuredAds : mockProducts).find(i => String(i.id) === strId); if (item) favorites.push({ ...item, type }); } saveData(); }
function trackFootprint(itemId, type) { const strId = String(itemId); const item = (type === 'ad' ? featuredAds : mockProducts).find(i => String(i.id) === strId); if (item) { footprints = footprints.filter(f => String(f.id) !== strId); footprints.unshift({ ...item, type }); if (footprints.length > 30) footprints.pop(); saveData(); } }

function renderAdvertDetail(adId) {
    let ad = featuredAds.find(item => String(item.id) === String(adId));
    if (!ad) { ad = mockProducts.find(p => String(p.id) === String(adId)); if (ad) return renderProductDetail(adId); return pages.home(); }
    const images = (ad.images && ad.images.length > 0) ? ad.images : (ad.imageUrl ? [ad.imageUrl] : [ad.icon || 'fa-rectangle-ad']);
    const cond = ad.condition || 'Featured';
    const price = (ad.price !== undefined && ad.price !== null) ? Number(ad.price).toFixed(2) : null;
    const title = ad.title || 'Featured Promotion';
    const shortDesc = ad.short || ad.link || 'Quality components and electronics';
    const description = ad.description || 'Verified manufacturer promotion with guaranteed supplier support.';
    const rawDetails = ad.details || (ad.description ? [ad.description] : ['Direct factory partner', 'Bulk order discount available', 'Official 1688 Electronic Mart verified supplier']);
    const details = Array.isArray(rawDetails) ? rawDetails : [rawDetails];
    const badge = ad.badge || 'Featured Ad';
    const cta = ad.cta || 'Contact Supplier';
    return `
        <section class=\"advert-detail page-enter\"><button class=\"back-button\" type=\"button\"><i class=\"fas fa-arrow-left\"></i>Back</button>
            <div class=\"detail-hero\"><div class=\"fav-overlay-detail ${favorites.some(f => String(f.id) === String(ad.id)) ? 'active' : ''}\" data-fav-id=\"${ad.id}\" data-fav-type=\"ad\"><i class=\"fas fa-heart\"></i></div><div class=\"detail-gallery-main\" id=\"advert-gallery-main\">${(images[0].startsWith('http') || images[0].startsWith('data:')) ? `<img id=\"advert-main-img\" src=\"${images[0]}\" alt=\"${title}\">` : `<i id=\"advert-main-img\" class=\"fas ${images[0].startsWith('fa-') ? images[0] : 'fa-rectangle-ad'} fa-4x\" style=\"color: var(--primary-color);\"></i>`}</div>${images.length > 1 ? `<div class=\"detail-gallery-thumbs\">${images.map((img, idx) => `<div class=\"thumb-node ${idx === 0 ? 'active' : ''}\" onclick=\"switchAdvertDetailImage('${img}', this)\">${(img.startsWith('http') || img.startsWith('data:')) ? `<img src=\"${img}\" alt=\"Thumbnail\">` : `<i class=\"fas ${img.startsWith('fa-') ? img : 'fa-rectangle-ad'}\"></i>`}</div>`).join('')}</div>` : ''}<div class=\"detail-badge\">${badge}</div></div>
            <div class=\"detail-card\"><div class=\"condition-badge ${cond.toLowerCase().includes('new') ? 'new' : 'used'}\" style=\"margin-bottom: 10px;\">${cond}</div><h1>${title}</h1><p class=\"detail-short\">${shortDesc}</p>${price ? `<div class=\"detail-price\">¥${price}</div>` : ''}<p class=\"detail-description\">${description}</p><div class=\"detail-list\">${details.map(item => `<div class=\"detail-item\"><i class=\"fas fa-check-circle\"></i><span>${item}</span></div>`).join('')}</div><div class=\"detail-actions\">${ad.link && ad.link.startsWith('http') ? `<button class=\"primary-btn\" type=\"button\" onclick=\"window.open('${ad.link}', '_blank')\">${cta}</button>` : `<button class=\"primary-btn buy-now-btn\" data-ad-id=\"${ad.id}\" data-item-type=\"ad\" type=\"button\">Start Inquiry</button>`}<button class=\"secondary-btn add-to-cart-ad\" data-ad-id=\"${ad.id}\" type=\"button\">Add to RFQ</button></div></div></section>`;
}

function renderProductDetail(productId) {
    let product = mockProducts.find(p => String(p.id) === String(productId));
    if (!product) { product = featuredAds.find(ad => String(ad.id) === String(productId)); if (product) return renderAdvertDetail(productId); return pages.home(); }
    const images = (product.images && product.images.length > 0) ? product.images : (product.imageUrl ? [product.imageUrl] : [product.image || product.icon || 'fa-image']);
    const cond = product.condition || 'New';
    const price = Number(product.price || 0).toFixed(2);
    const company = product.company || 'Electronics Supplier';
    const name = product.name || product.title || 'Electronic Component';
    const description = product.description || 'Verified authentic electronics item sourced directly from certified manufacturers on 1688 Mart.';
    const rawDetails = product.manufacturerDetails || product.details || ['Direct shipping from manufacturer', 'Quality guaranteed by 1688 Electronic Mart Inspection'];
    const detailsList = Array.isArray(rawDetails) ? rawDetails : [rawDetails];
    return `
        <section class=\"product-detail page-enter\"><button class=\"back-button\" type=\"button\"><i class=\"fas fa-arrow-left\"></i>Back</button>
            <div class=\"detail-hero\"><div class=\"fav-overlay-detail ${favorites.some(f => String(f.id) === String(product.id)) ? 'active' : ''}\" data-fav-id=\"${product.id}\" data-fav-type=\"prod\"><i class=\"fas fa-heart\"></i></div><div class=\"detail-gallery-main\" id=\"product-gallery-main\">${(images[0].startsWith('http') || images[0].startsWith('data:')) ? `<img id=\"product-main-img\" src=\"${images[0]}\" alt=\"${name}\">` : `<i id=\"product-main-img\" class=\"fas ${images[0].startsWith('fa-') ? images[0] : 'fa-image'} fa-4x\" style=\"color: var(--primary-color);\"></i>`}</div>${images.length > 1 ? `<div class=\"detail-gallery-thumbs\">${images.map((img, idx) => `<div class=\"thumb-node ${idx === 0 ? 'active' : ''}\" onclick=\"switchProductDetailImage('${img}', this)\">${(img.startsWith('http') || img.startsWith('data:')) ? `<img src=\"${img}\" alt=\"Thumbnail\">` : `<i class=\"fas ${img.startsWith('fa-') ? img : 'fa-image'}\"></i>`}</div>`).join('')}</div>` : ''}<div class=\"detail-badge\">Recommended</div></div>
            <div class=\"detail-card\"><div class=\"condition-badge ${cond.toLowerCase().includes('new') ? 'new' : 'used'}\" style=\"margin-bottom: 10px;\">${cond}</div><h1>${name}</h1><p class=\"detail-company\">${company}</p><div class=\"detail-price\">¥${price}</div>${product.wholesalePrice ? `<div class=\"detail-wholesale-price\" style=\"color: #666; font-size: 14px; margin-top: -8px; margin-bottom: 12px;\">Wholesale: ¥${Number(product.wholesalePrice).toFixed(2)}</div>` : ''}${product.moq ? `<div class=\"detail-moq\" style=\"background: #f0f0f0; display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-bottom: 12px;\">MOQ: ${product.moq} units</div>` : ''}<p class=\"detail-description\">${description}</p><div class=\"detail-list\">${detailsList.map(item => `<div class=\"detail-item\"><i class=\"fas fa-check-circle\"></i><span>${item}</span></div>`).join('')}</div><div class=\"detail-actions\"><button class=\"primary-btn buy-now-btn\" data-product-id=\"${product.id}\" data-item-type=\"prod\" type=\"button\">Start Inquiry / Buy</button><button class=\"secondary-btn add-to-cart-prod\" data-product-id=\"${product.id}\" type=\"button\">Add to RFQ</button></div></div></section>`;
}

// --- LISTENERS & INIT ---
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; renderProfilePageIfActive(); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; renderProfilePageIfActive(); });
window.addEventListener('popstate', handleRouting);

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => navigate(item.dataset.page)));
    handleRouting();

    // Real-time Listeners
    db.collection(\"system\").doc(\"shop_profile\").onSnapshot(doc => { if (doc.exists) { shopConfig = { ...shopConfig, ...doc.data() }; document.querySelectorAll('.official-logo-box').forEach(el => el.textContent = shopConfig.name); } });
    db.collection(\"products\").onSnapshot(s => { mockProducts = s.docs.map(d => ({ id: d.id, ...d.data() })); saveData(); if (document.getElementById('app-content').querySelector('.home-page')) navigate('home', '', null, 'default', false); });
    db.collection(\"categories\").onSnapshot(s => { if (!s.empty) { mockCategories = s.docs.map(d => ({ id: d.id, ...d.data() })); saveData(); } });
    db.collection(\"adverts\").onSnapshot(s => { if (s && !s.empty) { featuredAds = s.docs.map(d => ({ id: d.id, ...d.data() })); saveData(); } });
    rtdb.ref(\"system/deployment\").on(\"value\", s => checkUpdate(s.val()));
    setInterval(() => rtdb.ref(\"system/deployment\").once(\"value\").then(s => checkUpdate(s.val())), 1800000);

    auth.onAuthStateChanged((user) => {
        currentUser = user;
        if (user) {
            const userRef = db.collection(\"users\").doc(user.uid);
            userRef.set({ id: user.uid, name: user.displayName, email: user.email, photo: user.photoURL, lastLogin: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            userRef.onSnapshot(doc => { if (doc.exists) { userData = doc.data(); const bSec = document.getElementById('business-info-section'); if (bSec) bSec.innerHTML = renderBusinessInfoContent(); if (userData.companyName && window.location.hash === '#/profile') navigate('home'); } });
            rtdb.ref(\"chats\").on(\"value\", (s) => {
                const data = s.val(); if (!data) return;
                const oldChats = JSON.parse(JSON.stringify(userChats));
                const newItems = Object.values(data).filter(c => c.userName === user.displayName || c.id.includes(user.uid));
                userChats.length = 0; userChats.push(...newItems); storage.set('cache_chats', userChats);
                const content = document.getElementById('app-content');
                if (content && content.querySelector('.message-page')) content.innerHTML = pages.message();
                newItems.forEach(chat => { const old = oldChats.find(oc => oc.id === chat.id); if (old && chat.userUnreadCount > old.userUnreadCount) { playNotificationSound(); showNotificationToast(\"New Message\", `1688 Electronic: ${chat.lastMessage}`); } });
            });
        }
        handleRouting();
    });
});
