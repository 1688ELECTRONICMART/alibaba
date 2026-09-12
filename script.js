/**
 * 1688 Electronic Mart - Premium Web Interface
 */

// --- 1. FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyDvzRnxMv6FMZdx0obAZUAIUyTQtu1A-90",
    authDomain: "electronic-mart-1688.firebaseapp.com",
    databaseURL: "https://electronic-mart-1688-default-rtdb.firebaseio.com",
    projectId: "electronic-mart-1688",
    storageBucket: "electronic-mart-1688.firebasestorage.app",
    messagingSenderId: "988016654865",
    appId: "1:988016654865:web:e3afa29c54cc8a2b6f0fb0"
};

// --- 2. GLOBAL STATE ---
let db, rtdb, auth, provider;
let currentUser = null;
let userData = null;
let deferredPrompt = null;
let shopConfig = { name: "1688 Electronic Mart", location: "Shenzhen, China", rating: 4.8 };

const storage = {
    get: (key, fallback) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set: (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
};

let mockProducts = storage.get('cache_products', []);
let featuredAds = storage.get('cache_adverts', []);
let mockCategories = storage.get('cache_categories', [
    { id: 'c1', name: 'Phone', icon: 'fa-mobile-alt' },
    { id: 'c2', name: 'Electronics', icon: 'fa-bolt' },
    { id: 'c3', name: 'Instrument', icon: 'fa-microchip' },
    { id: 'c4', name: 'Vehicle', icon: 'fa-car' },
    { id: 'c5', name: 'Laptops', icon: 'fa-laptop' }
]);
let userChats = storage.get('cache_chats', []);
let cart = storage.get('cart', []);
let favorites = storage.get('favorites', []);
let footprints = storage.get('footprints', []);
let recentSearches = storage.get('recentSearches', []);
let addresses = storage.get('addresses', []);
let selectedCartItems = new Set(storage.get('selectedCartItems', []));
let addressFormState = { mode: 'new', id: null };

// --- 3. HELPERS ---
function cloudinaryOptimize(url, width = null) {
    if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url;
    const parts = url.split('/upload/');
    if (parts.length !== 2) return url;
    let trans = 'f_auto,q_auto';
    if (width) trans += `,w_${width},c_limit`;
    return `${parts[0]}/upload/${trans}/${parts[1]}`;
}

function renderThumbImage(srcOrIcon, className = '') {
    if (!srcOrIcon) return `<i class="fas fa-image ${className}"></i>`;
    const s = String(srcOrIcon).trim();
    if (s.startsWith('http') || s.startsWith('data:') || s.includes('/')) {
        return `<img src="${cloudinaryOptimize(s, 300)}" class="${className}" alt="Item" loading="lazy" onerror="this.style.display='none'">`;
    }
    return `<i class="fas ${s.startsWith('fa-') ? s : 'fa-' + s} ${className}"></i>`;
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
    storage.set('cache_products', mockProducts);
    storage.set('cache_adverts', featuredAds);
    storage.set('cache_categories', mockCategories);
    storage.set('cache_chats', userChats);
    storage.set('cart', cart);
    storage.set('favorites', favorites);
    storage.set('selectedCartItems', Array.from(selectedCartItems));
}

function trackFootprint(itemId, type) {
    const strId = String(itemId);
    const item = (type === 'ad' ? featuredAds : mockProducts).find(i => String(i.id) === strId);
    if (item) {
        footprints = footprints.filter(f => String(f.id) !== strId);
        footprints.unshift({ ...item, type });
        if (footprints.length > 30) footprints.pop();
        storage.set('footprints', footprints);
    }
}

// --- 4. NAVIGATION ---
function navigate(pageId, itemId = null, category = null, sortBy = 'default', updateUrl = true) {
    console.log("Navigating to:", pageId, itemId);
    const content = document.getElementById('app-content');
    if (!content) return;

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

    const header = document.querySelector('.header');
    const nav = document.querySelector('.bottom-nav');
    if (pageId === 'chat') { header.style.display = 'none'; nav.style.display = 'none'; document.body.classList.add('chat-mode'); }
    else { header.style.display = 'block'; nav.style.display = 'flex'; document.body.classList.remove('chat-mode'); }

    let html = '';
    if (pageId === 'advert-detail' && itemId) {
        trackFootprint(itemId, 'ad');
        html = renderAdvertDetail(itemId);
    } else if (pageId === 'product-detail' && itemId) {
        trackFootprint(itemId, 'prod');
        html = renderProductDetail(itemId);
    } else if (pages[pageId]) {
        html = pages[pageId](itemId, category, sortBy);
    } else {
        html = pages.home();
    }

    content.innerHTML = html;
    document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.remove('active');
        if (i.dataset.page === pageId) i.classList.add('active');
    });
    window.scrollTo(0, 0);
}

function handleRouting() {
    const hash = window.location.hash || '#/home';
    const [pathPart, queryPart] = hash.replace('#/', '').split('?');
    const segments = pathPart.split('/');
    const params = new URLSearchParams(queryPart || '');
    navigate(segments[0] || 'home', segments[1], params.get('cat'), params.get('sort') || 'default', false);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function openInvoice(invoiceId) {
    navigate('invoice', invoiceId);
}

function renderChatMessage(message) {
    const invoiceId = escapeHtml(message.invoiceId);
    const attachmentUrl = String(message.attachmentUrl || '').trim();
    const attachment = attachmentUrl
        ? `<a class="msg-attachment" href="${escapeHtml(attachmentUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(attachmentUrl)}" alt="Invoice attachment" loading="lazy"></a>`
        : '';
    const invoice = message.invoiceId
        ? `<div class="invoice-card"><div class="invoice-card-header"><i class="fas fa-file-pdf"></i><div><strong>Proforma Invoice</strong><small>${invoiceId}</small></div></div><button class="view-invoice-btn" onclick="openInvoice('${invoiceId}')">View Invoice</button></div>`
        : '';
    const text = message.text ? `<div>${escapeHtml(message.text)}</div>` : '';
    return `${invoice}${attachment}${text}`;
}

function renderInvoice(invoiceId) {
    const safeInvoiceId = escapeHtml(invoiceId || 'INV-PENDING');
    const customerName = escapeHtml(userData?.name || currentUser?.displayName || '1688 Customer');
    const customerEmail = escapeHtml(userData?.email || currentUser?.email || '');
    return `<section class="invoice-modal-overlay" id="invoice-modal">
        <div class="invoice-modal-content">
            <button class="close-modal no-print" aria-label="Close invoice" onclick="navigate('message')">&times;</button>
            <div class="invoice-paper">
                <div class="invoice-header">
                    <div class="invoice-logo"><div class="official-logo-box">1688 Electronic Mart</div><p>Electronic sourcing platform</p></div>
                    <div class="invoice-meta"><h1>PROFORMA INVOICE</h1><strong>${safeInvoiceId}</strong><p>${new Date().toLocaleDateString()}</p></div>
                </div>
                <div class="invoice-details">
                    <div class="invoice-col"><h3>Bill To</h3><p><strong>${customerName}</strong></p><p>${customerEmail}</p></div>
                    <div class="invoice-col"><h3>From</h3><p><strong>1688 Electronic Mart</strong></p><p>Shenzhen, China</p></div>
                </div>
                <table class="invoice-table"><thead><tr><th>Description</th><th>Quantity</th><th>Amount</th></tr></thead><tbody><tr><td>Electronic goods sourcing order</td><td>1</td><td>To be confirmed</td></tr></tbody></table>
                <div class="invoice-total"><div class="total-row grand-total"><span>Total</span><span>To be confirmed</span></div></div>
                <p class="invoice-footer">This proforma invoice was issued by 1688 Electronic Mart. Final pricing and shipping will be confirmed by the supplier.</p>
                <div class="no-print" style="margin-top:24px"><button class="primary-btn" onclick="window.print()"><i class="fas fa-print"></i> Print / Save PDF</button></div>
            </div>
        </div>
    </section>`;
}

// --- 5. RENDERERS ---
const pages = {
    home: (searchQuery = '', filterCategory = null, sortBy = 'default') => {
        const query = (searchQuery || '').toLowerCase().trim();
        const filtered = (mockProducts || []).filter(p => {
            const name = String(p.name || p.title || '').toLowerCase();
            return name.includes(query) && (filterCategory ? p.category === filterCategory : true);
        });

        return `
        <section class="home-page page-enter">
            <div class="promo-carousel" style="${featuredAds.length === 0 ? 'display:none' : ''}">
                ${featuredAds.map((ad, i) => `
                    <div class="carousel-slide ${i === 0 ? 'active' : ''}" onclick="navigate('advert-detail', '${ad.id}')" style="${ad.imageUrl ? `background-image: linear-gradient(135deg, rgba(0,0,0,0.2), rgba(0,0,0,0.2)), url('${cloudinaryOptimize(ad.imageUrl, 1000)}');` : `background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));`} background-size: cover; background-position: center; cursor: pointer;">
                        <div class="carousel-content"><h2>${ad.title || 'Promotion'}</h2><p>${ad.short || ''}</p></div>
                    </div>
                `).join('')}
            </div>
            <div class="category-grid">${mockCategories.map(c => `<div class="category-item" onclick="navigate('home', '', '${c.name}')"><div class="category-icon"><i class="fas ${c.icon}"></i></div><span>${c.name}</span></div>`).join('')}</div>
            <div class="section-title" style="padding:15px">${filterCategory || 'Recommended Items'}</div>
            <div class="product-grid">
                ${filtered.length === 0 ? '<p style="padding:20px; color:#999">No products found.</p>' : filtered.map(p => `
                    <button class="product-card stagger-item" onclick="navigate('product-detail', '${p.id}')">
                        <div class="product-img">${renderThumbImage(p.images?.[0]||p.imageUrl||p.image)}</div>
                        <div class="product-info">
                            <div class="product-name">${p.name||'Product'}</div>
                            <div class="product-price">¥${Number(p.price||0).toFixed(2)}</div>
                        </div>
                    </button>
                `).join('')}
            </div>
        </section>`;
    },
    cart: () => {
        if (cart.length === 0) return `<div class="empty-state page-enter" style="text-align:center; padding:100px 20px"><i class="fas fa-shopping-cart fa-3x" style="color:#ddd"></i><p style="margin-top:15px">Your cart is empty</p><button class="primary-btn" onclick="navigate('home')" style="margin-top:20px; background:var(--primary-color); color:white; border:none; padding:10px 20px; border-radius:8px">Go Sourcing</button></div>`;
        return `
            <div class="cart-page page-enter" style="padding:20px">
                <div class="section-title">My Cart (${cart.length})</div>
                <div class="cart-list" style="margin-top:20px">
                    ${cart.map(item => `
                        <div class="cart-item" style="display:flex; align-items:center; background:#fff; padding:15px; border-radius:12px; margin-bottom:10px; box-shadow:0 2px 8px rgba(0,0,0,0.05)">
                            <div style="width:60px; height:60px">${renderThumbImage(item.images?.[0] || item.imageUrl || item.image)}</div>
                            <div style="flex:1; margin-left:15px">
                                <div style="font-weight:bold">${item.name || item.title}</div>
                                <div style="color:var(--primary-color)">¥${Number(item.price || 0).toFixed(2)}</div>
                            </div>
                            <button onclick="removeFromCart('${item.id}')" style="border:none; background:none; color:#ff4d4f"><i class="fas fa-trash"></i></button>
                        </div>
                    `).join('')}
                </div>
                <button class="primary-btn" style="width:100%; margin-top:20px; background:var(--primary-color); color:#fff; border:none; padding:15px; border-radius:12px; font-weight:bold">Checkout</button>
            </div>`;
    },
    profile: () => {
        if (!currentUser) return `<div class="profile-page page-enter" style="text-align:center; padding:100px 20px"><img src="https://gw.alicdn.com/tps/i2/TB1nmqyFFXXXXcQbFXXE5jB3XXX-114-114.png" style="width:80px; margin-bottom:20px"><h2>Welcome to 1688</h2><button class="primary-btn" onclick="signInWithGoogle()" style="margin-top:20px; background:var(--primary-color); color:white; border:none; padding:12px 25px; border-radius:8px; font-weight:bold">Sign in with Google</button></div>`;
        const name = userData?.name || currentUser.displayName || 'Member';
        const email = userData?.email || currentUser.email || 'Email unavailable';
        const phone = userData?.phone || currentUser.phoneNumber || 'Not provided';
        const location = userData?.location || userData?.address || 'Not provided';
        return `
        <div class="profile-page page-enter">
            <header class="profile-header-premium">
                <div style="width:64px; height:64px; border-radius:50%; overflow:hidden; background:#eee">
                    ${currentUser.photoURL ? `<img src="${currentUser.photoURL}" style="width:100%; height:100%">` : '<i class="fas fa-user fa-2x"></i>'}
                </div>
                <div><h2 style="margin:0">${escapeHtml(name)}</h2><p style="margin:5px 0 0; opacity:0.7">${escapeHtml(email)}</p><small class="member-id">Member ID: ${escapeHtml(currentUser.uid)}</small></div>
            </header>
            <section class="profile-card-group">
                <div class="card-header"><span class="card-title">Account details</span></div>
                <div class="service-list">
                    <div class="service-item"><span class="service-item-left"><i class="fas fa-envelope"></i><span>Email</span></span><span>${escapeHtml(email)}</span></div>
                    <div class="service-item"><span class="service-item-left"><i class="fas fa-phone"></i><span>Phone</span></span><span>${escapeHtml(phone)}</span></div>
                    <div class="service-item"><span class="service-item-left"><i class="fas fa-location-dot"></i><span>Location</span></span><span>${escapeHtml(location)}</span></div>
                </div>
            </section>
            <section class="profile-card-group">
                <div class="card-header"><span class="card-title">Activity</span></div>
                <div class="icon-grid grid-3"><div class="grid-item"><span class="stat-val">${cart.length}</span><span class="stat-label">Cart items</span></div><div class="grid-item"><span class="stat-val">${favorites.length}</span><span class="stat-label">Favorites</span></div><div class="grid-item"><span class="stat-val">${userChats.length}</span><span class="stat-label">Messages</span></div></div>
            </section>
            <div class="logout-container">
                <button class="logout-btn" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Log Out</button>
            </div>
        </div>`;
    },
    invoice: (invoiceId) => renderInvoice(invoiceId),
    message: () => `<div class="message-page page-enter" style="padding:20px"><div class="section-title">Messages</div><div class="chat-list" style="margin-top:20px">${userChats.length === 0 ? '<p style="text-align:center; margin-top:50px; color:#999">No messages yet.</p>' : userChats.map(msg => `<div class="chat-item" onclick="navigate('chat', '${msg.id}')" style="padding:15px; background:#fff; border-radius:12px; margin-bottom:10px; box-shadow:0 2px 8px rgba(0,0,0,0.05)"><strong>${msg.userName}</strong><p style="font-size:12px; color:#666; margin-top:5px">${msg.lastMessage}</p></div>`).join('')}</div></div>`,
    chat: (id) => {
        const chat = userChats.find(m => m.id === id);
        if (!chat) return pages.message();
        return `
            <div class="chat-window page-enter">
                <div class="chat-window-header" style="padding:15px; background:#fff; border-bottom:1px solid #eee; display:flex; align-items:center">
                    <button onclick="navigate('message')" style="border:none; background:none; padding-right:15px"><i class="fas fa-arrow-left"></i></button>
                    <strong>${chat.userName}</strong>
                </div>
                <div class="chat-body" id="chat-body" style="height:calc(100vh - 120px); overflow-y:auto; padding:15px; display:flex; flex-direction:column">
                    ${chat.messages.map(m => `<div class="msg-bubble ${m.senderRole==='user'?'me':'them'}" style="margin-bottom:10px; padding:10px 15px; border-radius:15px; max-width:80%; align-self:${m.senderRole==='user'?'flex-end':'flex-start'}; background:${m.senderRole==='user'?'var(--primary-color)':'#f4f4f4'}; color:${m.senderRole==='user'?'#fff':'#333'}">${renderChatMessage(m)}</div>`).join('')}
                </div>
                <div class="chat-footer" style="padding:10px; background:#fff; border-top:1px solid #eee; display:flex; gap:10px">
                    <input type="text" id="chat-input" placeholder="Type a message..." style="flex:1; border:1px solid #ddd; padding:10px; border-radius:20px">
                    <button onclick="sendRealMessage('${chat.id}')" style="background:var(--primary-color); color:#fff; border:none; width:40px; height:40px; border-radius:50%"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>`;
    }
};

function renderAdvertDetail(adId) {
    const ad = featuredAds.find(x => String(x.id) === String(adId));
    if (!ad) return pages.home();
    return `<section class="advert-detail page-enter" style="padding:20px">
        <button class="back-button" onclick="navigate('home')" style="border:none; background:rgba(0,0,0,0.05); width:40px; height:40px; border-radius:50%; margin-bottom:15px"><i class="fas fa-arrow-left"></i></button>
        <div style="text-align:center">${renderThumbImage(ad.imageUrl || ad.icon, "style='width:100%; max-height:350px; border-radius:16px; object-fit:cover'")}</div>
        <div class="detail-card" style="background:#fff; padding:24px; border-radius:20px; margin-top:15px; box-shadow:0 4px 20px rgba(0,0,0,0.08)">
            <h1 style="font-size:24px; color:#222">${ad.title}</h1>
            <p style="color:#666; margin-top:15px; line-height:1.6">${ad.short || 'Authentic manufacturer promotion.'}</p>
            <div class="detail-actions" style="margin-top:30px; display:flex; gap:12px">
                <button class="primary-btn" style="flex:1.5; background:var(--primary-color); color:#fff; border:none; padding:15px; border-radius:12px; font-weight:bold" onclick="startChatWithSupplier('${ad.title.replace(/'/g, "\\'")}', 'ad', '${ad.imageUrl||''}')">Start Inquiry</button>
                <button class="secondary-btn" style="flex:1; border:1px solid #ddd; padding:15px; border-radius:12px; font-weight:bold" onclick="addToCart('${ad.id}', 'ad')">Add to RFQ</button>
            </div>
        </div>
    </section>`;
}

function renderProductDetail(id) {
    const p = mockProducts.find(x => String(x.id) === String(id));
    if (!p) return pages.home();
    return `<section class="product-detail page-enter" style="padding:20px">
        <button class="back-button" onclick="navigate('home')" style="border:none; background:rgba(0,0,0,0.05); width:40px; height:40px; border-radius:50%; margin-bottom:15px"><i class="fas fa-arrow-left"></i></button>
        <div style="text-align:center">${renderThumbImage(p.images?.[0] || p.imageUrl, "style='width:100%; max-height:350px; border-radius:16px; object-fit:contain'")}</div>
        <div class="detail-card" style="background:#fff; padding:24px; border-radius:20px; margin-top:15px; box-shadow:0 4px 20px rgba(0,0,0,0.08)">
            <div style="color:var(--primary-color); font-size:28px; font-weight:800">¥${Number(p.price||0).toFixed(2)}</div>
            <h1 style="font-size:20px; color:#222; margin-top:10px">${p.name}</h1>
            <p style="color:#555; margin-top:20px; line-height:1.6">${p.description || 'Verified authentic item.'}</p>
            <div class="detail-actions" style="margin-top:30px; display:flex; gap:12px">
                <button class="primary-btn" style="flex:1.5; background:var(--primary-color); color:#fff; border:none; padding:15px; border-radius:12px; font-weight:bold" onclick="startChatWithSupplier('${p.name.replace(/'/g, "\\'")}', 'prod', '${p.images?.[0]||''}')">Buy Now</button>
                <button class="secondary-btn" style="flex:1; border:1px solid #ddd; padding:15px; border-radius:12px; font-weight:bold" onclick="addToCart('${p.id}', 'prod')">Add to Cart</button>
            </div>
        </div>
    </section>`;
}

// --- 6. CORE ACTIONS ---
function signInWithGoogle() { auth.signInWithPopup(provider).catch(e => alert(e.message)); }
function logout() { if(confirm('Log out?')) auth.signOut().then(() => { localStorage.clear(); location.reload(); }); }
function addToCart(id, type) {
    const item = (type==='ad'?featuredAds:mockProducts).find(x => String(x.id) === String(id));
    if (item && !cart.find(x => String(x.id) === String(id))) { cart.push({...item, type}); saveData(); showNotificationToast("Success", "Added to cart!"); }
}
function removeFromCart(id) { cart = cart.filter(x => String(x.id) !== String(id)); saveData(); navigate('cart'); }
function startChatWithSupplier(name, type, img) {
    if (!currentUser) return navigate('profile');
    const chatId = `chat_${currentUser.uid}`;
    const ref = rtdb.ref(`chats/${chatId}`);
    ref.once('value').then(s => {
        const data = s.val() || { id: chatId, userName: currentUser.displayName, messages: [], adminUnreadCount: 0 };
        data.messages.push({ sender: currentUser.displayName, text: `Inquiry: ${name}`, time: new Date().toLocaleTimeString(), senderRole: 'user', fromMe: true, attachmentUrl: img });
        data.lastMessage = `Inquiry: ${name}`; data.adminUnreadCount++;
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
        ref.update(data).then(() => { input.value = ''; navigate('chat', chatId, null, 'default', false); });
    });
}

// --- 7. INITIALIZATION ---
window.addEventListener('popstate', handleRouting);
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => navigate(item.dataset.page)));
    if (typeof firebase !== 'undefined') {
        try {
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            rtdb = firebase.database();
            auth = firebase.auth();
            provider = new firebase.auth.GoogleAuthProvider();

            auth.onAuthStateChanged(user => {
                currentUser = user;
                if (user) {
                    db.collection("users").doc(user.uid).set({ id: user.uid, name: user.displayName, email: user.email }, { merge: true });
                    db.collection("users").doc(user.uid).get().then(snapshot => {
                        userData = snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : { id: user.uid, name: user.displayName, email: user.email };
                        if (document.querySelector('.profile-page')) navigate('profile', null, null, 'default', false);
                    }).catch(handleFirebaseError);
                    rtdb.ref("chats").on("value", s => {
                        const d = s.val(); if (d) { userChats = Object.values(d).filter(c => c.id.includes(user.uid)); saveData(); if (document.querySelector('.message-page')) navigate('message', null, null, 'default', false); }
                    });
                }
                handleRouting();
            });
            db.collection("products").onSnapshot(s => { mockProducts = s.docs.map(d => ({ id: d.id, ...d.data() })); saveData(); handleRouting(); }, handleFirebaseError);
            db.collection("adverts").onSnapshot(s => { featuredAds = s.docs.map(d => ({ id: d.id, ...d.data() })); saveData(); handleRouting(); }, handleFirebaseError);
        } catch (error) {
            handleFirebaseError(error);
            handleRouting();
        }
    } else {
        handleRouting();
    }
});

function handleFirebaseError(error) {
    console.error('Firebase connection failed:', error);
    showNotificationToast('Connection unavailable', 'Showing locally cached products.');
}
