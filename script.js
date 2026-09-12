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

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    var db = firebase.firestore();
    var rtdb = firebase.database();
    var auth = firebase.auth();
    var provider = new firebase.auth.GoogleAuthProvider();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
} else {
    // Mock for offline/error
    var db = { collection: () => ({ onSnapshot: () => {}, doc: () => ({ onSnapshot: () => {}, set: () => Promise.resolve(), update: () => Promise.resolve() }) }) };
    var rtdb = { ref: () => ({ on: () => {}, once: () => Promise.resolve({ val: () => null }), set: () => Promise.resolve(), update: () => Promise.resolve() }) };
    var auth = { onAuthStateChanged: () => {}, signOut: () => Promise.resolve() };
}

// Persistent State Helper
const storage = {
    get: (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } },
    set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
};

// Global State
let currentUser = null;
let userData = null;
let deferredPrompt = null;
let shopConfig = storage.get('shop_config', { name: "1688 Electronic Mart", location: "Shenzhen, China", rating: 4.8 });
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
let favorites = storage.get('favorites', []);
let footprints = storage.get('footprints', []);
let recentSearches = storage.get('recentSearches', []);
let addresses = storage.get('addresses', []);
let selectedCartItems = new Set(storage.get('selectedCartItems', []));
let addressFormState = { mode: 'new', id: null };

// Audio Preload
const msgSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
function playNotificationSound() { try { msgSound.play().catch(e => {}); } catch(e) {} }

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
        return `<img src="${cloudinaryOptimize(rawSrc, 300)}" class="${className}" alt="Product" loading="lazy" onerror="this.style.display='none'">`;
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
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 5000);
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

// --- NAVIGATION ---
function navigate(pageId, itemId = null, category = null, sortBy = 'default', updateUrl = true) {
    const content = document.getElementById('app-content');
    const mainHeader = document.querySelector('.header');
    const bottomNav = document.querySelector('.bottom-nav');

    if (updateUrl) {
        let hash = `#/${pageId}`;
        if (itemId) hash += `/${itemId}`;
        const params = new URLSearchParams();
        if (category) params.set('cat', category);
        if (sortBy !== 'default') params.set('sort', sortBy);
        const paramStr = params.toString();
        if (paramStr) hash += `?${paramStr}`;
        window.history.pushState(null, null, hash);
    }

    document.body.classList.remove('chat-mode');
    if (pageId === 'chat') {
        mainHeader.style.setProperty('display', 'none', 'important');
        bottomNav.style.setProperty('display', 'none', 'important');
        document.body.style.paddingBottom = '0';
        document.body.classList.add('chat-mode');
    } else {
        mainHeader.style.display = 'block';
        bottomNav.style.display = 'flex';
        document.body.style.paddingBottom = '60px';
    }

    const isTabSwitch = ['home', 'cart', 'message', 'profile'].includes(pageId) && !itemId && !category && sortBy === 'default';
    if (isTabSwitch && (!content.innerHTML || content.innerHTML.length < 100)) {
        content.innerHTML = `<div class="loading-container"><div class="spinner"></div></div>`;
    }

    content.style.opacity = '0';
    content.style.transform = 'translateY(10px)';
    content.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

    const delay = isTabSwitch ? 400 : 100;

    setTimeout(() => {
        try {
            if (pageId === 'chat') content.style.transform = 'none';

            if (pageId === 'advert-detail' && itemId) {
                trackFootprint(itemId, 'ad');
                content.innerHTML = renderAdvertDetail(itemId);
            } else if (pageId === 'product-detail' && itemId) {
                trackFootprint(itemId, 'prod');
                content.innerHTML = renderProductDetail(itemId);
            } else if (pageId === 'orders') {
                content.innerHTML = pages.orders(itemId || 'all');
            } else if (pageId === 'home') {
                content.innerHTML = pages.home(itemId || '', category, sortBy);
            } else if (pageId === 'chat' && itemId) {
                content.innerHTML = pages.chat(itemId);
            } else if (pageId === 'checkout-success') {
                content.innerHTML = pages['checkout-success'](itemId);
            } else if (pages[pageId]) {
                content.innerHTML = pages[pageId]();
            }
        } catch (e) {
            console.error("Navigation Error:", e);
            content.innerHTML = `<div class="empty-state"><p>Something went wrong. Please refresh.</p></div>`;
        }

        content.style.opacity = '1';
        if (pageId !== 'chat') content.style.transform = 'translateY(0)';
        updateActiveNav(pageId);
    }, delay);
}

function updateActiveNav(pageId) {
    const profileSubPages = ['orders', 'address', 'security', 'help', 'about', 'favorites', 'footprints', 'followed'];
    const targetPage = (pageId === 'advert-detail' || pageId === 'product-detail' || pageId === 'checkout-success') ? 'home' :
                       (profileSubPages.includes(pageId) ? 'profile' : pageId);

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === targetPage) item.classList.add('active');
    });
}

// --- RENDERERS ---
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
                        <div class="carousel-content"><h2>${ad.title || 'Special Promotion'}</h2><p>${ad.short || 'Quality components'}</p></div>
                        ${ad.imageUrl ? `<img src="${cloudinaryOptimize(ad.imageUrl, 100)}" alt="Promo" style="width:50px; height:50px; border-radius:8px; margin-left:auto; border:2px solid #fff;">` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="category-grid">${cats.map(cat => `<div class="category-item" onclick="navigate('home', '', '${cat.name}')"><div class="category-icon"><i class="fas ${cat.icon}"></i></div><span>${cat.name}</span></div>`).join('')}</div>
            <div class="home-filters"><div class="section-title">${filterCategory || 'Recommended'}</div></div>
            <div class="product-grid">
                ${filteredProducts.length === 0 ? '<div class="empty-state"><p>No items found.</p></div>' : filteredProducts.map((p, i) => `
                    <button class="product-card stagger-item" type="button" data-product-id="${p.id}" data-item-type="prod" style="animation-delay: ${i * 0.1}s">
                        <div class="product-img">${renderThumbImage(p.images?.[0] || p.imageUrl || p.image || p.icon)}</div>
                        <div class="product-info">
                            <div class="product-name">${p.name || 'Product'}</div>
                            <div class="product-price">¥${Number(p.price || 0).toFixed(2)}</div>
                        </div>
                    </button>
                `).join('')}
            </div>
        </section>`;
    },
    cart: () => {
        if (cart.length === 0) return `<div class="empty-state page-enter"><i class="fas fa-shopping-cart fa-3x"></i><p>Your cart is empty</p><button class="primary-btn" style="margin-top:20px" onclick="navigate('home')">Go Sourcing</button></div>`;
        return `
            <div class="cart-page page-enter" style="padding:20px">
                <div class="section-title">My Cart (${cart.length})</div>
                <div class="cart-list">
                    ${cart.map(item => `
                        <div class="cart-item" style="display:flex; align-items:center; background:#fff; padding:15px; border-radius:12px; margin-bottom:10px; box-shadow:0 2px 8px rgba(0,0,0,0.05)">
                            <div style="width:60px; height:60px">${renderThumbImage(item.images?.[0] || item.imageUrl || item.image)}</div>
                            <div style="flex:1; margin-left:15px">
                                <div style="font-weight:bold">${item.name || item.title}</div>
                                <div style="color:var(--primary-color)">¥${Number(item.price || 0).toFixed(2)}</div>
                            </div>
                            <button class="remove-btn" onclick="removeFromCart('${item.id}')" style="border:none; background:none; color:#ff4d4f"><i class="fas fa-trash"></i></button>
                        </div>
                    `).join('')}
                </div>
                <button class="primary-btn" style="width:100%; margin-top:20px; background:var(--primary-color); color:#fff; border:none; padding:15px; border-radius:12px; font-weight:bold">Checkout</button>
            </div>`;
    },
    profile: () => {
        if (!currentUser) return `<div class="profile-page page-enter" style="text-align:center; padding:100px 20px"><h2>Welcome to 1688</h2><button class="google-signin-btn" onclick="signInWithGoogle()" style="margin-top:20px">Continue with Google</button></div>`;
        return `
        <div class="profile-page page-enter">
            <header class="profile-header-premium" style="background:#333; color:#fff; padding:40px 20px">
                <h2 style="margin:0">${currentUser.displayName || 'Member'}</h2>
                <p style="margin:5px 0 0; opacity:0.7">${currentUser.email}</p>
            </header>
            <div class="service-list" style="padding:20px; display:flex; flex-direction:column; gap:12px">
                ${deferredPrompt ? `<button onclick="installPWA()" style="padding:15px; background:#fff2ea; color:#ff6000; border:1px solid #ff6000; border-radius:10px; font-weight:bold"><i class="fas fa-download"></i> Install App</button>` : ''}
                <button class="secondary-btn" onclick="logout()" style="padding:15px; background:#fff; color:#ff4d4f; border:1px solid #eee; border-radius:10px; font-weight:bold"><i class="fas fa-sign-out-alt"></i> Log Out</button>
            </div>
        </div>`;
    },
    message: () => `
        <div class="message-page page-enter" style="padding:20px">
            <div class="section-title">Messages</div>
            <div class="chat-list">
                ${userChats.length === 0 ? '<p class="empty-state">No messages yet.</p>' : userChats.map(msg => `
                    <div class="chat-item" onclick="navigate('chat', '${msg.id}')" style="padding:15px; background:#fff; border-radius:12px; margin-bottom:10px; box-shadow:0 2px 8px rgba(0,0,0,0.05)">
                        <strong style="display:block">${msg.userName}</strong>
                        <p style="font-size:12px; color:#666; margin-top:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${msg.lastMessage}</p>
                    </div>
                `).join('')}
            </div>
        </div>`,
    chat: (id) => {
        const chat = userChats.find(m => m.id === id);
        if (!chat) return navigate('message');
        return `
            <div class="chat-window page-enter">
                <div class="chat-window-header" style="padding:15px; background:#fff; border-bottom:1px solid #eee; display:flex; align-items:center">
                    <button onclick="navigate('message')" style="border:none; background:none; padding-right:15px"><i class="fas fa-arrow-left"></i></button>
                    <strong>${chat.userName}</strong>
                </div>
                <div class="chat-body" id="chat-body" style="height:calc(100vh - 120px); overflow-y:auto; padding:15px; display:flex; flex-direction:column">
                    ${chat.messages.map(m => `
                        <div class="msg-bubble ${m.senderRole==='user'?'me':'them'}" style="margin-bottom:10px; padding:10px 15px; border-radius:15px; max-width:80%; align-self:${m.senderRole==='user'?'flex-end':'flex-start'}; background:${m.senderRole==='user'?'var(--primary-color)':'#f4f4f4'}; color:${m.senderRole==='user'?'#fff':'#333'}">
                            ${m.text}
                        </div>
                    `).join('')}
                </div>
                <div class="chat-footer" style="padding:10px; background:#fff; border-top:1px solid #eee; display:flex; gap:10px">
                    <input type="text" id="chat-input" placeholder="Type a message..." style="flex:1; border:1px solid #ddd; padding:10px; border-radius:20px; outline:none">
                    <button onclick="sendRealMessage('${chat.id}')" style="background:var(--primary-color); color:#fff; border:none; width:40px; height:40px; border-radius:50%"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>`;
    }
};

function renderAdvertDetail(adId) {
    const ad = featuredAds.find(x => String(x.id) === String(adId));
    if (!ad) return pages.home();
    return `<section class="advert-detail page-enter" style="padding:20px">
        <button class="back-button" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
        <div style="text-align:center; padding:20px">${renderThumbImage(ad.imageUrl || ad.icon, "style='width:100%; max-height:300px; border-radius:16px; object-fit:cover'")}</div>
        <div class="detail-card" style="background:#fff; padding:20px; border-radius:16px; margin-top:20px; box-shadow:0 4px 12px rgba(0,0,0,0.05)">
            <h1 style="font-size:24px">${ad.title}</h1>
            <p style="color:#666; margin-top:15px; line-height:1.6">${ad.short || ''}</p>
            <div class="detail-actions" style="margin-top:30px; display:flex; gap:10px">
                <button class="primary-btn" style="flex:1; background:var(--primary-color); color:#fff; border:none; padding:15px; border-radius:12px; font-weight:bold" onclick="startChatWithSupplier('${ad.title}', 'ad', '${ad.imageUrl||''}')">Start Inquiry</button>
                <button class="secondary-btn" style="flex:1; border:1px solid #ddd; padding:15px; border-radius:12px; font-weight:bold" onclick="addToCart('${ad.id}', 'ad')">Add to RFQ</button>
            </div>
        </div>
    </section>`;
}

function renderProductDetail(id) {
    const p = mockProducts.find(x => String(x.id) === String(id));
    if (!p) return pages.home();
    return `<section class="product-detail page-enter" style="padding:20px">
        <button class="back-button" onclick="navigate('home')"><i class="fas fa-arrow-left"></i></button>
        <div style="text-align:center; padding:20px">${renderThumbImage(p.images?.[0] || p.imageUrl, "style='width:100%; max-height:300px; border-radius:16px; object-fit:contain'")}</div>
        <div class="detail-card" style="background:#fff; padding:20px; border-radius:16px; margin-top:20px; box-shadow:0 4px 12px rgba(0,0,0,0.05)">
            <h1 style="font-size:22px">${p.name}</h1>
            <p style="color:var(--primary-color); font-size:24px; font-weight:800; margin-top:10px">¥${Number(p.price||0).toFixed(2)}</p>
            <p style="color:#666; margin-top:15px; line-height:1.6">${p.description || 'Quality sourcing item.'}</p>
            <div class="detail-actions" style="margin-top:30px; display:flex; gap:10px">
                <button class="primary-btn" style="flex:1; background:var(--primary-color); color:#fff; border:none; padding:15px; border-radius:12px; font-weight:bold" onclick="startChatWithSupplier('${p.name}', 'prod', '${p.images?.[0]||''}')">Buy Now</button>
                <button class="secondary-btn" style="flex:1; border:1px solid #ddd; padding:15px; border-radius:12px; font-weight:bold" onclick="addToCart('${p.id}', 'prod')">Add to Cart</button>
            </div>
        </div>
    </section>`;
}

// --- ACTIONS ---
function addToCart(id, type) {
    const list = type === 'ad' ? featuredAds : mockProducts;
    const item = list.find(x => String(x.id) === String(id));
    if (item && !cart.find(x => String(x.id) === String(id))) {
        cart.push({...item, type}); saveData(); showNotificationToast("Success", "Added to cart!");
    } else { showNotificationToast("Info", "Already in cart."); }
}
function removeFromCart(id) { cart = cart.filter(x => String(x.id) !== String(id)); saveData(); navigate('cart'); }
function signInWithGoogle() { auth.signInWithPopup(provider).catch(e => alert(e.message)); }
function logout() { if(confirm('Logout?')) auth.signOut().then(() => { localStorage.clear(); location.reload(); }); }
window.installPWA = async function() { if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; renderProfilePageIfActive(); };

function startChatWithSupplier(name, type, img) {
    if (!currentUser) return navigate('profile');
    const chatId = `chat_${currentUser.uid}`;
    const ref = rtdb.ref(`chats/${chatId}`);
    const msg = { sender: currentUser.displayName, text: `Inquiry: ${name}`, time: new Date().toLocaleTimeString(), senderRole: 'user', fromMe: true, attachmentUrl: img };
    ref.once('value').then(s => {
        const data = s.val() || { id: chatId, userName: currentUser.displayName, messages: [], adminUnreadCount: 0 };
        data.messages.push(msg); data.lastMessage = `Inquiry: ${name}`; data.lastTime = 'Just now'; data.adminUnreadCount++;
        ref.set(data).then(() => navigate('chat', chatId));
    });
}

function sendRealMessage(chatId) {
    const input = document.getElementById('chat-input'); if (!input || !input.value.trim()) return;
    const ref = rtdb.ref(`chats/${chatId}`);
    ref.once('value').then(s => {
        const data = s.val(); if (!data) return;
        data.messages.push({ sender: currentUser.displayName, text: input.value.trim(), time: new Date().toLocaleTimeString(), senderRole: 'user', fromMe: true });
        data.lastMessage = input.value.trim(); data.adminUnreadCount++;
        ref.update(data).then(() => { input.value = ''; document.getElementById('chat-body').innerHTML = pages.chat(chatId); });
    });
}

// --- VERSION TRACKING & UPDATE ---
function checkUpdate(data) {
    if (!data || !data.last_updated_at) return;
    const last = storage.get('last_applied_version', 0);
    if (data.last_updated_at > last) {
        storage.set('last_applied_version', data.last_updated_at);
        showNotificationToast("Updating", "Refreshing to latest version...");
        setTimeout(() => location.reload(true), 1500);
    }
}

// --- INITIALIZATION ---
window.addEventListener('popstate', handleRouting);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; renderProfilePageIfActive(); });
function renderProfilePageIfActive() { if (document.querySelector('.profile-page')) navigate('profile', null, null, 'default', false); }
function handleRouting() {
    const hash = window.location.hash || '#/home';
    const path = hash.replace('#/', '').split('?')[0];
    const segments = path.split('/');
    navigate(segments[0] || 'home', segments[1], null, 'default', false);
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => navigate(item.dataset.page)));
    if (typeof firebase !== 'undefined') {
        auth.onAuthStateChanged(user => {
            currentUser = user;
            if (user) {
                db.collection("users").doc(user.uid).set({ id: user.uid, name: user.displayName, email: user.email, lastLogin: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
                rtdb.ref("chats").on("value", s => {
                    const data = s.val(); if (!data) return;
                    const list = Object.values(data).filter(c => c.id.includes(user.uid));
                    userChats.length = 0; userChats.push(...list); saveData();
                });
            }
            handleRouting();
        });
        db.collection("products").onSnapshot(s => { mockProducts = s.docs.map(d => ({ id: d.id, ...d.data() })); saveData(); handleRouting(); });
        rtdb.ref("system/deployment").on("value", s => checkUpdate(s.val()));
    }
    handleRouting();
});

document.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) { navigate('product-detail', card.dataset.productId); }
});
