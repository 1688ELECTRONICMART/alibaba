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

if (typeof firebase === 'undefined') {
    console.error("Firebase SDK failed to load. Operating in offline mode.");
    // Mock minimal firebase objects to avoid crashes
    var firebase = { initializeApp: () => ({}), firestore: () => ({ collection: () => ({ onSnapshot: () => ({}) }) }), database: () => ({ ref: () => ({ on: () => ({}) }) }), auth: () => ({ onAuthStateChanged: () => ({}), signOut: () => Promise.resolve() }) };
    var db = firebase.firestore();
    var rtdb = firebase.database();
    var auth = firebase.auth();
} else {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    var db = firebase.firestore();
    var rtdb = firebase.database();
    var auth = firebase.auth();
}
var provider = (typeof firebase.auth !== 'undefined') ? new firebase.auth.GoogleAuthProvider() : null;

// Persistent State Helper
const storage = {
    get: (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; }
        catch { return fallback; }
    },
    set: (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
};

let currentUser = null;
let userData = null;
let mockProducts = storage.get('cache_products', []);
let featuredAds = storage.get('cache_adverts', []);
if (!featuredAds || featuredAds.length === 0) {
    featuredAds = [
        { id: 'ad1', title: 'Quality Electronics', short: 'Sourced from top manufacturers', icon: 'fa-microchip', type: 'ad' },
        { id: 'ad2', title: 'Global Logistics', short: 'Fast delivery to your door', icon: 'fa-truck', type: 'ad' }
    ];
}
let mockCategories = storage.get('cache_categories', [
    { id: 'c1', name: 'Phone', icon: 'fa-mobile-alt' },
    { id: 'c2', name: 'Electronics', icon: 'fa-bolt' },
    { id: 'c3', name: 'Instrument', icon: 'fa-microchip' },
    { id: 'c4', name: 'Vehicle', icon: 'fa-car' },
    { id: 'c5', name: 'Laptops', icon: 'fa-laptop' }
]);
let userChats = [];

function signInWithGoogle() {
    auth.signInWithPopup(provider).catch(error => {
        console.error("Auth Error:", error);
        alert("Failed to sign in with Google.");
    });
}

function renderHomePageIfActive() {
    const content = document.getElementById('app-content');
    const isHome = content && content.querySelector('.home-page');
    if (isHome) {
        // Soft refresh without loader
        const searchQuery = document.getElementById('search-input')?.value || '';
        content.innerHTML = pages.home(searchQuery);
    }
}

// Hot Update Engine Listener
rtdb.ref("system/deployment").on("value", (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    // Check if this is a new update (ignoring the first load)
    const now = new Date().getTime();
    if (now - data.last_updated_at < 30000) { // Only if updated in the last 30 seconds
        console.log("Hot update signal received:", data);
        applyHotPatch(data);
    }
});

function applyHotPatch(data) {
    const isForce = data.force_reload;
    showNotificationToast(
        isForce ? "Critical Update" : "System Update",
        isForce ? "A mandatory update is being applied..." : "Applying live improvements..."
    );

    // Show Progress Bar
    const progress = document.createElement('div');
    progress.className = 'update-progress';
    document.body.appendChild(progress);
    setTimeout(() => progress.style.width = '100%', 50);

    if (isForce) {
        // Force Reload with countdown
        setTimeout(() => {
            progress.style.background = '#ff4d4f';
            showNotificationToast("Reloading", "Refreshing to latest version...");
            setTimeout(() => location.reload(), 1500);
        }, 1000);
        return;
    }

    // 1. Hot Swap CSS
    const links = document.getElementsByTagName('link');
    for (let link of links) {
        if (link.rel === 'stylesheet' && link.href.includes('style.css')) {
            link.href = 'style.css?v=' + data.last_updated_at;
            break;
        }
    }

    // 2. Refresh Background Cache via Service Worker
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'HOT_PATCH',
            version: data.last_updated_at
        });
    }

    // 3. Re-render Current View
    const currentPath = document.querySelector('.nav-item.active')?.dataset.page || 'home';
    setTimeout(() => {
        navigate(currentPath);
        setTimeout(() => progress.remove(), 500);
    }, 1500);
}

const mockOrders = [];
const mockMessages = [];
const followedShops = [];

let cart = storage.get('cart', []);
let selectedCartItems = new Set(storage.get('selectedCartItems', []));
let favorites = storage.get('favorites', []);
let footprints = storage.get('footprints', []);
let recentSearches = storage.get('recentSearches', []);
let addresses = storage.get('addresses', []);
let profileImage = storage.get('profileImage', null);

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

function showNotificationToast(title, body) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas fa-bullhorn"></i></div>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${body}</p>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}
let addressFormState = { mode: 'new', id: null };

function getAddressDefaults() {
    const current = addressFormState.id ? addresses.find(item => item.id === addressFormState.id) : null;

    return current || {
        label: 'Home',
        name: '',
        phone: '',
        city: '',
        district: '',
        address: '',
        postcode: ''
    };
}

function renderAddressForm() {
    const current = getAddressDefaults();
    const isEdit = addressFormState.mode === 'edit' && addressFormState.id;

    return `
        <form class="address-form" id="address-form">
            <div class="address-form-title">${isEdit ? 'Edit shipping address' : 'Add shipping address'}</div>

            <div class="form-grid">
                <label class="field-group">
                    <span>Address label</span>
                    <input type="text" name="label" value="${current.label || ''}" placeholder="Home / Office" required>
                </label>
                <label class="field-group">
                    <span>Contact name</span>
                    <input type="text" name="name" value="${current.name || ''}" placeholder="Full name" required>
                </label>
                <label class="field-group">
                    <span>Phone number</span>
                    <input type="tel" name="phone" value="${current.phone || ''}" placeholder="+86 138 ..." required>
                </label>
                <label class="field-group">
                    <span>City</span>
                    <input type="text" name="city" value="${current.city || ''}" placeholder="Shenzhen" required>
                </label>
                <label class="field-group">
                    <span>District</span>
                    <input type="text" name="district" value="${current.district || ''}" placeholder="Nanshan District" required>
                </label>
                <label class="field-group">
                    <span>Postal code</span>
                    <input type="text" name="postcode" value="${current.postcode || ''}" placeholder="518000" required>
                </label>
            </div>

            <label class="field-group field-full">
                <span>Street address</span>
                <textarea name="address" rows="3" placeholder="Street, building, unit, landmark" required>${current.address || ''}</textarea>
            </label>

            <div class="address-form-actions">
                <button class="primary-btn" type="submit">${isEdit ? 'Save changes' : 'Add address'}</button>
                <button class="secondary-btn cancel-address-btn" type="button">Cancel</button>
            </div>
        </form>
    `;
}

function cloudinaryOptimize(url, width = null) {
    if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com')) return url;
    const parts = url.split('/upload/');
    if (parts.length !== 2) return url;
    let transformations = 'f_auto,q_auto';
    if (width) transformations += `,w_${width},c_limit`;
    return `${parts[0]}/upload/${transformations}/${parts[1]}`;
}

function renderThumbImage(imgSrcOrIcon, className = '') {
    if (!imgSrcOrIcon) {
        return `<i class="fas fa-image ${className}"></i>`;
    }
    const rawSrc = String(imgSrcOrIcon).trim();
    if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://') || rawSrc.startsWith('data:') || rawSrc.includes('/')) {
        const src = cloudinaryOptimize(rawSrc, 300);
        return `<img src="${src}" class="${className}" alt="Product" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\\\'fas fa-image ${className}\\\'></i>';">`;
    }
    const iconClass = rawSrc.startsWith('fa-') ? rawSrc : `fa-${rawSrc}`;
    return `<i class="fas ${iconClass} ${className}"></i>`;
}

window.switchProductDetailImage = function(src, el) {
    const mainContainer = document.getElementById('product-gallery-main');
    if (!mainContainer) return;
    if (src.startsWith('http') || src.startsWith('data:')) {
        const optimizedSrc = cloudinaryOptimize(src, 800);
        mainContainer.innerHTML = `<img id="product-main-img" src="${optimizedSrc}" alt="Product" style="width: 100%; height: 100%; object-fit: contain;">`;
    } else {
        mainContainer.innerHTML = `<i id="product-main-img" class="fas ${src.startsWith('fa-') ? src : 'fa-image'} fa-4x" style="color: var(--primary-color);"></i>`;
    }
    document.querySelectorAll('.detail-gallery-thumbs .thumb-node').forEach(t => {
        t.style.borderColor = '#eee';
        t.classList.remove('active');
    });
    if (el) {
        el.style.borderColor = 'var(--primary-color)';
        el.classList.add('active');
    }
};

window.switchAdvertDetailImage = function(src, el) {
    const mainContainer = document.getElementById('advert-gallery-main');
    if (!mainContainer) return;
    if (src.startsWith('http') || src.startsWith('data:')) {
        mainContainer.innerHTML = `<img id="advert-main-img" src="${src}" alt="Advert" style="width: 100%; height: 100%; object-fit: contain;">`;
    } else {
        mainContainer.innerHTML = `<i id="advert-main-img" class="fas ${src.startsWith('fa-') ? src : 'fa-rectangle-ad'} fa-4x" style="color: var(--primary-color);"></i>`;
    }
    document.querySelectorAll('.detail-gallery-thumbs .thumb-node').forEach(t => {
        t.style.borderColor = '#eee';
        t.classList.remove('active');
    });
    if (el) {
        el.style.borderColor = 'var(--primary-color)';
        el.classList.add('active');
    }
};

function addToCart(itemId, type) {
    if (!currentUser) {
        alert("Please sign in to add items to your cart.");
        navigate('profile');
        return false;
    }
    const strId = String(itemId);
    let item;
    if (type === 'ad') {
        item = featuredAds.find(ad => String(ad.id) === strId) || mockProducts.find(p => String(p.id) === strId);
    } else {
        item = mockProducts.find(p => String(p.id) === strId) || featuredAds.find(ad => String(ad.id) === strId);
    }

    if (item && !cart.some(c => String(c.id) === String(item.id))) {
        cart.push({ ...item, type });
        selectedCartItems.add(String(item.id));
        saveData();
        updateCartBadge();
        showNotificationToast("Cart Updated", `${item.title || item.name} added to cart!`);
        return true;
    } else if (item) {
        showNotificationToast("Notice", 'Item is already in your cart.');
        return true;
    }
    return false;
}

function toggleCartItem(itemId) {
    const id = String(itemId);
    if (selectedCartItems.has(id)) {
        selectedCartItems.delete(id);
    } else {
        selectedCartItems.add(id);
    }
    saveData();
    const content = document.getElementById('app-content');
    if (content.querySelector('.cart-page')) {
        content.innerHTML = pages.cart();
    }
}

function sendRealMessage(chatId) {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentUser) return;

    const chatRef = rtdb.ref(`chats/${chatId}`);
    chatRef.once('value').then(snapshot => {
        const chatData = snapshot.val();
        const newMessage = {
            sender: currentUser.displayName || 'Customer',
            text: text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            fromMe: true
        };

        const updatedMessages = [...(chatData.messages || []), newMessage];
        chatRef.update({
            messages: updatedMessages,
            lastMessage: text,
            lastTime: 'Just now',
            adminUnreadCount: (chatData.adminUnreadCount || 0) + 1
        });

        input.value = '';
    });
}

function startChatWithSupplier(itemName, type = 'product') {
    if (!currentUser) return navigate('profile');

    const chatId = `chat_${currentUser.uid}`;
    const chatRef = rtdb.ref(`chats/${chatId}`);
    const inquiryPrefix = type === 'ad' ? 'Advert Inquiry' : 'Product Inquiry';

    chatRef.once('value').then(snapshot => {
        const newMessage = {
            sender: currentUser.displayName,
            text: `Hello, I'm interested in this ${type === 'ad' ? 'advert' : 'product'}: ${itemName}.`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            fromMe: true
        };

        if (!snapshot.exists()) {
            chatRef.set({
                id: chatId,
                userName: currentUser.displayName,
                userAvatar: 'fa-user',
                lastMessage: `${inquiryPrefix}: ${itemName}`,
                lastTime: 'Just now',
                messages: [newMessage],
                adminUnreadCount: 1,
                userUnreadCount: 0
            });
        } else {
            const chatData = snapshot.val();
            const updatedMessages = [...(chatData.messages || []), newMessage];
            chatRef.update({
                messages: updatedMessages,
                lastMessage: `${inquiryPrefix}: ${itemName}`,
                lastTime: 'Just now',
                adminUnreadCount: (chatData.adminUnreadCount || 0) + 1
            });
        }
        navigate('chat', chatId);
    });
}

function toggleFavorite(itemId, type) {
    const strId = String(itemId);
    const isFav = favorites.some(f => String(f.id) === strId);

    if (isFav) {
        favorites = favorites.filter(f => String(f.id) !== strId);
    } else {
        const item = (type === 'ad') 
            ? (featuredAds.find(ad => String(ad.id) === strId) || mockProducts.find(p => String(p.id) === strId))
            : (mockProducts.find(p => String(p.id) === strId) || featuredAds.find(ad => String(ad.id) === strId));
        if (item) favorites.push({ ...item, type });
    }
    saveData();

    const content = document.getElementById('app-content');
    if (content.querySelector('.favorites-page') && pages.favorites) {
        content.innerHTML = pages.favorites();
    }
}

function trackFootprint(itemId, type) {
    const strId = String(itemId);
    const item = (type === 'ad') 
        ? (featuredAds.find(ad => String(ad.id) === strId) || mockProducts.find(p => String(p.id) === strId))
        : (mockProducts.find(p => String(p.id) === strId) || featuredAds.find(ad => String(ad.id) === strId));

    if (item) {
        footprints = footprints.filter(f => String(f.id) !== strId);
        footprints.unshift({ ...item, type });
        if (footprints.length > 30) footprints.pop();
        saveData();
    }
}

function updateCartBadge() {
    const badge = document.querySelector('.cart-badge');
    if (!badge) return;

    const count = cart.length;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function removeFromCart(itemId) {
    const normalizedId = String(itemId);
    cart = cart.filter(item => String(item.id) !== normalizedId);
    selectedCartItems.delete(normalizedId);
    saveData();
    updateCartBadge();
    navigate('cart');
}

function checkout() {
    const selectedList = cart.filter(item => selectedCartItems.has(String(item.id)));
    if (selectedList.length === 0) return;

    const content = document.getElementById('app-content');
    content.style.opacity = '0.5';
    content.style.pointerEvents = 'none';

    setTimeout(() => {
        // Selective remove
        const selectedIds = new Set(selectedList.map(item => String(item.id)));
        cart = cart.filter(item => !selectedIds.has(String(item.id)));
        selectedCartItems = new Set();

        saveData();
        updateCartBadge();

        content.style.opacity = '1';
        content.style.pointerEvents = 'auto';
        navigate('checkout-success', selectedList);
    }, 1500);
}

function renderBusinessInfoContent() {
    if (!userData) return '<p>Loading business info...</p>';
    return `
        <div class="business-info-fields">
            <div class="form-group">
                <label>Company Name</label>
                <input type="text" id="biz-company" value="${userData.companyName || ''}" placeholder="e.g. Acme Electronics Ltd">
            </div>
            <div class="form-group">
                <label>Business Type</label>
                <select id="biz-type">
                    <option value="" ${!userData.businessType ? 'selected' : ''}>Select Type</option>
                    <option value="Manufacturer" ${userData.businessType === 'Manufacturer' ? 'selected' : ''}>Manufacturer</option>
                    <option value="Wholesaler" ${userData.businessType === 'Wholesaler' ? 'selected' : ''}>Wholesaler</option>
                    <option value="Retailer" ${userData.businessType === 'Retailer' ? 'selected' : ''}>Retailer</option>
                    <option value="Agent" ${userData.businessType === 'Agent' ? 'selected' : ''}>Agent</option>
                </select>
            </div>
            <button class="mini-btn highlight" onclick="saveBusinessInfo()" style="width: 100%; margin-top: 10px;">Save Business Info</button>
        </div>
    `;
}

function saveBusinessInfo() {
    if (!currentUser) return;
    const companyName = document.getElementById('biz-company').value.trim();
    const businessType = document.getElementById('biz-type').value;

    db.collection("users").doc(currentUser.uid).update({
        companyName: companyName,
        businessType: businessType
    }).then(() => {
        showNotificationToast("Success", "Business profile updated!");
    }).catch(err => {
        alert("Error updating profile: " + err.message);
    });
}

function logout() {
    if (confirm('Are you sure you want to log out? This will reset all your sourcing data.')) {
        auth.signOut().then(() => {
            localStorage.clear();
            location.reload(); // Hard reset
        });
    }
}

function deleteAccount() {
    if (confirm('WARNING: This will permanently delete your account and all saved data. This action cannot be undone.')) {
        if (confirm('Final confirmation: Delete account now?')) {
            localStorage.clear();
            alert('Your account has been permanently deleted.');
            location.reload();
        }
    }
}

function saveAddress(formData) {
    const formValues = {
        label: formData.get('label')?.toString().trim(),
        name: formData.get('name')?.toString().trim(),
        phone: formData.get('phone')?.toString().trim(),
        city: formData.get('city')?.toString().trim(),
        district: formData.get('district')?.toString().trim(),
        postcode: formData.get('postcode')?.toString().trim(),
        address: formData.get('address')?.toString().trim()
    };

    // Advanced Validation
    if (formValues.name.length < 2) return alert('Contact name is too short.');
    if (!/^\+?[\d\s-]{8,}$/.test(formValues.phone)) return alert('Please enter a valid phone number.');
    if (!/^\d{5,6}$/.test(formValues.postcode)) return alert('Postal code must be 5 or 6 digits.');
    if (formValues.address.length < 5) return alert('Please provide a more detailed street address.');

    if (addressFormState.mode === 'edit' && addressFormState.id) {
        addresses = addresses.map(item => item.id === addressFormState.id ? { ...item, ...formValues } : item);
    } else {
        addresses = [{
            id: Date.now(),
            ...formValues
        }, ...addresses];
    }

    saveData();
    addressFormState = { mode: 'new', id: null };
    navigate('profile');
}

const pages = {
    home: (searchQuery = '', filterCategory = null, sortBy = 'default') => {
        const query = (searchQuery || '').toLowerCase().trim();
        const products = Array.isArray(mockProducts) ? mockProducts : [];
        const ads = Array.isArray(featuredAds) ? featuredAds : [];
        const cats = Array.isArray(mockCategories) ? mockCategories : [];

        let filteredProducts = products.filter(p => {
            const name = String(p.name || p.title || '').toLowerCase();
            const company = String(p.company || '').toLowerCase();
            const matchesQuery = name.includes(query) || company.includes(query);
            const matchesCategory = filterCategory ? p.category === filterCategory : true;
            return matchesQuery && matchesCategory;
        });

        if (sortBy === 'low') filteredProducts.sort((a, b) => (a.price || 0) - (b.price || 0));
        else if (sortBy === 'high') filteredProducts.sort((a, b) => (b.price || 0) - (a.price || 0));

        return `
        <section class="home-page page-enter">
            <div id="search-history-container" class="search-history-dropdown" style="display: none;">
                <div class="history-header">
                    <span>Recent Searches</span>
                    <button class="clear-history-btn">Clear</button>
                </div>
                <div class="history-tags">
                    ${(recentSearches || []).map(s => `<button class="history-tag" onclick="document.getElementById('search-input').value='${s}'; navigate('home', '${s}')">${s}</button>`).join('')}
                </div>
            </div>

            <div class="promo-carousel" style="${ads.length === 0 ? 'display:none' : ''}">
                ${ads.map((ad, i) => {
                    const bgStyle = ad.imageUrl
                        ? `background-image: linear-gradient(135deg, rgba(255, 106, 0, 0.8), rgba(219, 75, 0, 0.9)), url('${cloudinaryOptimize(ad.imageUrl, 1000)}');`
                        : `background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));`;
                    const thumbUrl = ad.imageUrl ? cloudinaryOptimize(ad.imageUrl, 100) : null;

                    return `
                    <div class="carousel-slide ${i === 0 ? 'active' : ''}" data-ad-id="${ad.id}" style="${bgStyle} background-size: cover; background-position: center; cursor: pointer;">
                        <div class="carousel-content">
                            <h2>${ad.title || 'Special Promotion'}</h2>
                            <p>${ad.short || ad.link || 'Quality components and electronics'}</p>
                        </div>
                        ${ad.imageUrl ? `<img src="${thumbUrl}" alt="Promo" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-left: auto; border: 2px solid rgba(255,255,255,0.7); shadow: 0 4px 10px rgba(0,0,0,0.15);" onerror="this.style.display='none'">` : `<i class="fas ${ad.icon || 'fa-rectangle-ad'} fa-3x" style="margin-left: auto; opacity: 0.3;"></i>`}
                    </div>
                `}).join('')}
                ${ads.length > 1 ? `
                    <div class="carousel-indicators">
                        ${ads.map((_, i) => `<span class="indicator-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="category-grid">
                ${cats.map(cat => `
                    <div class="category-item" onclick="navigate('home', '', '${cat.name}')">
                        <div class="category-icon"><i class="fas ${cat.icon}"></i></div>
                        <span>${cat.name}</span>
                    </div>
                `).join('')}
            </div>

            <div class="home-filters">
                <div class="section-title">${filterCategory ? filterCategory : 'Recommended'}</div>
                <select class="sort-select" onchange="navigate('home', '', '${filterCategory || ''}', this.value)">
                    <option value="default" ${sortBy === 'default' ? 'selected' : ''}>Default</option>
                    <option value="low" ${sortBy === 'low' ? 'selected' : ''}>Price: Low to High</option>
                    <option value="high" ${sortBy === 'high' ? 'selected' : ''}>Price: High to Low</option>
                </select>
            </div>

            <div class="home-section" id="recommended-section" style="padding-top: 0;">
                ${filteredProducts.length === 0 ? `
                    <div class="empty-state" style="padding: 60px 20px; text-align: center; color: #ccc;">
                        <i class="fas fa-box-open fa-4x" style="margin-bottom: 20px; opacity: 0.5;"></i>
                        <p style="font-weight: 600; color: #999;">${searchQuery ? `No matching products for "${searchQuery}"` : 'Your electronic mart is ready.'}</p>
                        <p style="font-size: 12px; margin-top: 8px;">Add items in the admin app to see them here.</p>
                    </div>
                ` : `
                    <div class="product-grid">
                        ${filteredProducts.map((p, i) => {
                            const firstImg = (p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || p.image || p.icon);
                            const cond = p.condition || 'New';
                            const priceVal = Number(p.price || 0).toFixed(2);
                            const isFavorite = favorites.some(f => String(f.id) === String(p.id));
                            return `
                            <button class="product-card stagger-item" type="button" data-product-id="${p.id}" data-item-type="prod" style="animation-delay: ${i * 0.1}s">
                                <div class="fav-overlay ${isFavorite ? 'active' : ''}" data-fav-id="${p.id}" data-fav-type="prod">
                                    <i class="fas fa-heart"></i>
                                </div>
                                <div class="product-img">
                                    ${renderThumbImage(firstImg)}
                                </div>
                                <div class="product-info">
                                    <div class="condition-badge ${cond.toLowerCase().includes('new') ? 'new' : 'used'}">${cond}</div>
                                    <div class="product-name">${p.name || p.title || 'Product'}</div>
                                    <div class="product-price">¥${priceVal}</div>
                                    <div class="product-company">${p.company || 'Electronics Supplier'}</div>
                                </div>
                            </button>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        </section>
    `;
    },
    cart: () => {
        if (cart.length === 0) {
            return `
                <div class="empty-state page-enter">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Your cart is empty</p>
                    <button class="go-shopping" type="button">Go Sourcing</button>
                </div>
            `;
        }

        const selectedList = cart.filter(item => selectedCartItems.has(String(item.id)));
        const total = selectedList.reduce((sum, item) => sum + item.price, 0);

        return `
            <div class="cart-page page-enter">
                <div class="section-title">My Cart (${cart.length})</div>
                <div class="cart-list">
                    ${cart.map(item => `
                        <div class="cart-item">
                            <input type="checkbox" class="cart-checkbox"
                                ${selectedCartItems.has(String(item.id)) ? 'checked' : ''}
                                onchange="toggleCartItem('${item.id}')">
                            <div class="cart-item-img">
                                ${renderThumbImage(item.images && item.images.length > 0 ? item.images[0] : (item.imageUrl || item.image || item.icon))}
                            </div>
                            <div class="cart-item-info">
                                <div class="cart-item-name">${item.title || item.name}</div>
                                <div class="cart-item-price">¥${item.price.toFixed(2)}</div>
                            </div>
                            <button class="remove-btn" type="button" data-remove-id="${item.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
                <div class="cart-footer">
                    <div class="cart-total">
                        <span>Selected (${selectedList.length}):</span>
                        <span>¥${total.toFixed(2)}</span>
                    </div>
                    <button class="checkout-btn ${selectedList.length === 0 ? 'disabled' : ''}"
                        type="button" onclick="${selectedList.length > 0 ? 'checkout()' : ''}">Checkout</button>
                </div>
            </div>
        `;
    },
    message: () => {
        if (!currentUser) {
            return `
                <div class="message-page page-enter">
                    <div class="empty-state" style="padding-top: 100px;">
                        <i class="fas fa-comments"></i>
                        <p>Sign in to view your messages</p>
                        <button class="primary-btn" onclick="navigate('profile')" style="margin-top: 20px;">Go to Profile</button>
                    </div>
                </div>
            `;
        }
        return `
        <div class="message-page page-enter">
            <div class="section-title">Messages</div>
            <div class="chat-list">
                ${userChats.length === 0 ? '<p class="empty-state">No messages yet.</p>' : userChats.map(msg => `
                    <div class="chat-item" data-chat-id="${msg.id}">
                        <div class="chat-avatar">
                            <i class="fas ${msg.userAvatar || 'fa-user'}"></i>
                        </div>
                        <div class="chat-info">
                            <div class="chat-header">
                                <span class="chat-name">${msg.userName}</span>
                                <span class="chat-time">${msg.lastTime}</span>
                            </div>
                            <div class="chat-snippet">${msg.lastMessage}</div>
                        </div>
                        ${msg.userUnreadCount > 0 ? `<div class="unread-dot">${msg.userUnreadCount}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    },
    chat: (chatId) => {
        const chat = userChats.find(m => m.id === chatId);
        if (!chat) return navigate('message');

        return `
            <div class="chat-window page-enter">
                <div class="chat-window-header">
                    <button class="back-button" type="button" data-nav-back="message">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="chat-window-title">
                        <div class="chat-avatar mini"><i class="fas ${chat.userAvatar || 'fa-user'}"></i></div>
                        <span>${chat.userName}</span>
                    </div>
                </div>
                <div class="chat-body" id="chat-body">
                    ${chat.messages.map(m => `
                        <div class="msg-bubble ${m.fromMe ? 'me' : 'them'}">
                            <div class="msg-text">${m.text}</div>
                            <div class="msg-time">${m.time}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="chat-footer">
                    <input type="text" id="chat-input" placeholder="Type a message...">
                    <button class="send-btn" onclick="sendRealMessage('${chat.id}')"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
    },
    profile: () => {
        if (!currentUser) {
            return `
                <div class="profile-page page-enter">
                    <div style="text-align: center; padding: 60px 20px;">
                        <i class="fas fa-user-circle fa-5x" style="color: #ddd; margin-bottom: 20px;"></i>
                        <h2>Welcome to 1688</h2>
                        <p style="color: var(--light-text); margin-bottom: 30px;">Sign in to manage your orders, favorites, and chat with suppliers.</p>
                        <button class="google-signin-btn" onclick="signInWithGoogle()">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_\"G\"_logo.svg" alt="Google logo" class="google-icon-img">
                            <span>Continue with Google</span>
                        </button>
                    </div>
                </div>
            `;
        }

        return `
        <div class="profile-page page-enter">
            <header class="profile-header-premium" style="background: #333;">
                <div class="avatar-container">
                    <div class="profile-avatar-premium profile-avatar-image-container">
                        ${currentUser.photoURL ? `<img class="profile-user-image" src="${currentUser.photoURL}" alt="Profile avatar">` : `<i class="fas fa-user fa-2x"></i>`}
                    </div>
                </div>
                <div class="profile-info-premium">
                    <h2>${currentUser.displayName || 'Member'}</h2>
                    <p style="color: rgba(255,255,255,0.7); font-size: 12px;">${currentUser.email}</p>
                </div>
            </header>

            <section class="profile-card-group">
                <div class="section-title" style="margin: 15px 16px 5px;">Business Profile</div>
                <div id="business-info-section" style="padding: 16px; background: white; margin: 0 16px 16px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    ${renderBusinessInfoContent()}
                </div>

                <div class="service-list">
                    <div class="service-item" data-service="favorites">
                        <div class="service-item-left">
                            <i class="fas fa-heart" style="color: #ff4d4f;"></i>
                            <span>My Favorites</span>
                        </div>
                        <i class="fas fa-chevron-right chevron"></i>
                    </div>
                    <div class="service-item" data-service="footprints">
                        <div class="service-item-left">
                            <i class="fas fa-history" style="color: #1890ff;"></i>
                            <span>Browsing History</span>
                        </div>
                        <i class="fas fa-chevron-right chevron"></i>
                    </div>
                    <div class="service-item" data-service="address">
                        <div class="service-item-left">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>Shipping Address</span>
                        </div>
                        <i class="fas fa-chevron-right chevron"></i>
                    </div>
                    <div class="service-item" data-service="security">
                        <div class="service-item-left">
                            <i class="fas fa-user-shield"></i>
                            <span>Security Center</span>
                        </div>
                        <i class="fas fa-chevron-right chevron"></i>
                    </div>
                    <div class="service-item" data-service="help">
                        <div class="service-item-left">
                            <i class="fas fa-headset"></i>
                            <span>Help & Customer Service</span>
                        </div>
                        <i class="fas fa-chevron-right chevron"></i>
                    </div>
                    <div class="service-item" data-service="about">
                        <div class="service-item-left">
                            <i class="fas fa-info-circle"></i>
                            <span>About 1688 Electronic Mart</span>
                        </div>
                        <i class="fas fa-chevron-right chevron"></i>
                    </div>
                </div>
            </section>

            <div class="logout-container">
                <button class="logout-btn" type="button" onclick="logout()">Log Out</button>
            </div>
        </div>
    `;
    },
    orders: (status) => {
        const filtered = status === 'all' ? mockOrders : mockOrders.filter(o => o.status === status);
        const labels = {
            all: 'All Orders',
            unpaid: 'Pending Payment',
            to_ship: 'To Ship',
            to_receive: 'To Receive',
            to_review: 'To Review',
            refund: 'Refund/After-sale'
        };

        return `
            <div class="orders-page page-enter">
                <div class="orders-header">
                    <button class="back-button" type="button" data-nav-back="profile">
                        <i class="fas fa-arrow-left"></i>
                        Back
                    </button>
                    <div class="section-title">${labels[status] || 'My Orders'}</div>
                </div>
                ${filtered.length === 0 ? `
                    <div class="empty-state">
                        <i class="fas fa-clipboard-list"></i>
                        <p>No orders found in this category.</p>
                    </div>
                ` : `
                    <div class="orders-list">
                        ${filtered.map(order => `
                            <div class="order-item">
                                <div class="order-item-header">
                                    <span>Order ID: ${order.id}</span>
                                    <span class="order-status-tag status-${order.status}">${order.status.replace('_', ' ')}</span>
                                </div>
                                <div class="order-item-content">
                                    <div class="order-item-img"><i class="fas ${order.icon}"></i></div>
                                    <div class="order-item-info">
                                        <div class="order-item-name">${order.name}</div>
                                        <div class="order-item-price">¥${order.price.toFixed(2)}</div>
                                    </div>
                                </div>
                                <div class="order-item-footer">
                                    <span class="order-date">${order.date}</span>
                                    <div class="order-actions">
                                        <button class="mini-btn" type="button">Details</button>
                                        ${order.status === 'unpaid' ? '<button class="mini-btn highlight" type="button">Pay Now</button>' : ''}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    },
    address: () => `
        <div class="service-page page-enter">
            <div class="orders-header">
                <button class="back-button" type="button" data-nav-back="profile">
                    <i class="fas fa-arrow-left"></i>
                    Back
                </button>
                <div class="section-title">Shipping Address</div>
            </div>
            <div class="address-list">
                ${addresses.length === 0 ? '<div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>No addresses saved yet.</p></div>' : addresses.map((address, index) => `
                    <div class="address-item ${index === 0 ? 'active' : ''}">
                        <div class="address-header">
                            <span class="name">${address.name}</span>
                            <span class="phone">${address.phone}</span>
                        </div>
                        <div class="address-content">
                            <div class="address-label">${address.label}</div>
                            <div>${address.address}</div>
                            <div>${address.city}, ${address.district}, ${address.postcode}</div>
                        </div>
                        <div class="address-footer">
                            <span class="default-tag">${index === 0 ? 'Default' : 'Saved'}</span>
                            <div class="address-actions">
                                <button class="mini-btn edit-address" type="button" data-address-id="${address.id}">Edit</button>
                                <button class="mini-btn delete-address" type="button" data-address-id="${address.id}">Delete</button>
                            </div>
                        </div>
                    </div>
                `).join('')}
                <button class="add-address-btn" type="button">+ Add New Address</button>
                ${renderAddressForm()}
            </div>
        </div>
    `,
    security: () => `
        <div class="service-page page-enter">
            <div class="orders-header">
                <button class="back-button" type="button" data-nav-back="profile">
                    <i class="fas fa-arrow-left"></i>
                    Back
                </button>
                <div class="section-title">Security Center</div>
            </div>
            <div class="service-list profile-card-group">
                <div class="service-item"><span>Modify Password</span><i class="fas fa-chevron-right chevron"></i></div>
                <div class="service-item"><span>Binding Phone</span><i class="fas fa-chevron-right chevron"></i></div>
                <div class="service-item"><span>Payment Security</span><i class="fas fa-chevron-right chevron"></i></div>
                <div class="service-item delete-account-item" style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 20px;">
                    <span style="color: #ff4d4f; font-weight: bold;">Delete Account Permanently</span>
                    <i class="fas fa-chevron-right chevron"></i>
                </div>
            </div>
        </div>
    `,
    help: () => `
        <div class="service-page page-enter">
            <div class="orders-header">
                <button class="back-button" type="button" data-nav-back="profile">
                    <i class="fas fa-arrow-left"></i>
                    Back
                </button>
                <div class="section-title">Help & Customer Service</div>
            </div>
            <div class="help-section">
                <div class="help-search">
                    <i class="fas fa-search"></i>
                    <input type="text" placeholder="How can we help you?">
                </div>
                <div class="faq-list profile-card-group">
                    <div class="service-item"><span>How to track my order?</span><i class="fas fa-chevron-right chevron"></i></div>
                    <div class="service-item"><span>Refund policy</span><i class="fas fa-chevron-right chevron"></i></div>
                    <div class="service-item"><span>Contacting the supplier</span><i class="fas fa-chevron-right chevron"></i></div>
                </div>
                <button class="contact-btn">Live Chat Support</button>
            </div>
        </div>
    `,
    about: () => `
        <div class="service-page page-enter">
            <div class="orders-header">
                <button class="back-button" type="button" data-nav-back="profile">
                    <i class="fas fa-arrow-left"></i>
                    Back
                </button>
                <div class="section-title">About Us</div>
            </div>
            <div class="about-content">
                <div class="about-logo">
                    <div class="profile-avatar-premium" style="margin: 0 auto 15px; background: var(--primary-color); color: white;">
                        <i class="fas fa-store fa-2x"></i>
                    </div>
                    <h3 style="text-align: center;">1688 Electronic Mart</h3>
                    <p style="text-align: center; color: var(--light-text); font-size: 12px;">Version 2.0.4</p>
                </div>
                <div class="service-list profile-card-group" style="margin-top: 30px;">
                    <div class="service-item"><span>Terms of Service</span><i class="fas fa-chevron-right chevron"></i></div>
                    <div class="service-item"><span>Privacy Policy</span><i class="fas fa-chevron-right chevron"></i></div>
                    <div class="service-item"><span>Official Website</span><i class="fas fa-chevron-right chevron"></i></div>
                </div>
            </div>
        </div>
    `,
    followed: () => `
        <div class="followed-page page-enter">
            <div class="orders-header">
                <button class="back-button" type="button" data-nav-back="profile">
                    <i class="fas fa-arrow-left"></i>
                    Back
                </button>
                <div class="section-title">Followed Shops</div>
            </div>
            <div class="shop-list">
                ${followedShops.map(shop => `
                    <div class="shop-card">
                        <div class="shop-icon"><i class="fas ${shop.icon}"></i></div>
                        <div class="shop-info">
                            <div class="shop-name">${shop.name}</div>
                            <div class="shop-meta">
                                <span><i class="fas fa-star" style="color:#faad14"></i> ${shop.rating}</span>
                                <span>${shop.products} Products</span>
                            </div>
                            <div class="shop-location">${shop.location}, China</div>
                        </div>
                        <button class="enter-shop-btn" onclick="document.getElementById('search-input').value='${shop.name.split(' ')[0]}'; navigate('home', '${shop.name.split(' ')[0]}')">Enter</button>
                    </div>
                `).join('')}
            </div>
        </div>
    `,
    'checkout-success': (boughtItems = []) => `
        <div class="success-page page-enter">
            <div class="success-icon">
                <i class="fas fa-check-circle"></i>
            </div>
            <h1>Order Successful!</h1>
            <p>Your payment for ${boughtItems.length} item(s) has been processed.</p>
            <div class="bought-summary">
                ${boughtItems.map(item => `
                    <div class="summary-item">
                        <div style="width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 6px; margin-right: 10px; background: #f4f4f4; flex-shrink: 0;">
                            ${renderThumbImage(item.images && item.images.length > 0 ? item.images[0] : (item.imageUrl || item.image || item.icon))}
                        </div>
                        <span>${item.title || item.name}</span>
                    </div>
                `).join('')}
            </div>
            <div class="order-id">Transaction ID: TXN-${Math.floor(Math.random() * 1000000)}</div>
            <button class="primary-btn go-home-btn" type="button">Continue Sourcing</button>
        </div>
    `,
    favorites: () => `
        <div class="favorites-page page-enter">
            <div class="orders-header">
                <button class="back-button" type="button" data-nav-back="profile">
                    <i class="fas fa-arrow-left"></i>
                    Back
                </button>
                <div class="section-title">My Favorites (${favorites.length})</div>
            </div>
            ${favorites.length === 0 ? `
                <div class="empty-state">
                    <i class="fas fa-heart"></i>
                    <p>No favorites yet.</p>
                </div>
            ` : `
                <div class="product-grid">
                    ${favorites.map((p, i) => {
                        const firstImg = (p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || p.image || p.icon);
                        const cond = p.condition || 'New';
                        const priceVal = Number(p.price || 0).toFixed(2);
                        return `
                        <button class="product-card stagger-item" type="button" data-product-id="${p.id}" data-item-type="${p.type || 'prod'}">
                            <div class="fav-overlay active" data-fav-id="${p.id}" data-fav-type="${p.type || 'prod'}">
                                <i class="fas fa-heart"></i>
                            </div>
                            <div class="product-img">
                                ${renderThumbImage(firstImg)}
                            </div>
                            <div class="product-info">
                                <div class="condition-badge ${cond.toLowerCase().includes('new') ? 'new' : 'used'}">${cond}</div>
                                <div class="product-name">${p.name || p.title || 'Product'}</div>
                                <div class="product-price">¥${priceVal}</div>
                                <div class="product-company">${p.company || 'Electronics Supplier'}</div>
                            </div>
                        </button>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `,
    footprints: () => `
        <div class="footprints-page page-enter">
            <div class="orders-header">
                <button class="back-button" type="button" data-nav-back="profile">
                    <i class="fas fa-arrow-left"></i>
                    Back
                </button>
                <div class="section-title">Browsing History (${footprints.length})</div>
            </div>
            ${footprints.length === 0 ? `
                <div class="empty-state">
                    <i class="fas fa-history"></i>
                    <p>No browsing history yet.</p>
                </div>
            ` : `
                <div class="product-grid">
                    ${footprints.map((p, i) => {
                        const firstImg = (p.images && p.images.length > 0) ? p.images[0] : (p.imageUrl || p.image || p.icon);
                        const cond = p.condition || 'New';
                        const priceVal = Number(p.price || 0).toFixed(2);
                        return `
                        <button class="product-card stagger-item" type="button" data-product-id="${p.id}" data-item-type="${p.type || 'prod'}">
                            <div class="product-img">
                                ${renderThumbImage(firstImg)}
                            </div>
                            <div class="product-info">
                                <div class="condition-badge ${cond.toLowerCase().includes('new') ? 'new' : 'used'}">${cond}</div>
                                <div class="product-name">${p.name || p.title || 'Product'}</div>
                                <div class="product-price">¥${priceVal}</div>
                                <div class="product-company">${p.company || 'Electronics Supplier'}</div>
                            </div>
                        </button>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `
};

function renderAdvertDetail(adId) {
    let ad = featuredAds.find(item => String(item.id) === String(adId));

    if (!ad) {
        ad = mockProducts.find(p => String(p.id) === String(adId));
        if (ad) {
            return renderProductDetail(adId);
        }
        return pages.home();
    }

    const images = (ad.images && ad.images.length > 0) 
        ? ad.images 
        : (ad.imageUrl ? [ad.imageUrl] : [ad.icon || 'fa-rectangle-ad']);

    const condition = ad.condition || 'Featured';
    const price = (ad.price !== undefined && ad.price !== null) ? Number(ad.price).toFixed(2) : null;
    const title = ad.title || 'Featured Promotion';
    const shortDesc = ad.short || ad.link || 'Quality components and electronics';
    const description = ad.description || 'Verified manufacturer promotion with guaranteed supplier support.';
    const rawDetails = ad.details || (ad.description ? [ad.description] : [
        'Direct factory partner',
        'Bulk order discount available',
        'Official 1688 Electronic Mart verified supplier'
    ]);
    const details = Array.isArray(rawDetails) ? rawDetails : [rawDetails];
    const badge = ad.badge || 'Featured Ad';
    const cta = ad.cta || 'Contact Supplier';

    return `
        <section class="advert-detail page-enter">
            <button class="back-button" type="button">
                <i class="fas fa-arrow-left"></i>
                Back
            </button>

            <div class="detail-hero">
                <div class="fav-overlay-detail ${favorites.some(f => String(f.id) === String(ad.id)) ? 'active' : ''}" data-fav-id="${ad.id}" data-fav-type="ad">
                    <i class="fas fa-heart"></i>
                </div>
                <div class="detail-gallery-main" id="advert-gallery-main">
                    ${(images[0].startsWith('http') || images[0].startsWith('data:')) ? 
                        `<img id="advert-main-img" src="${images[0]}" alt="${title}">` : 
                        `<i id="advert-main-img" class="fas ${images[0].startsWith('fa-') ? images[0] : 'fa-rectangle-ad'} fa-4x" style="color: var(--primary-color);"></i>`
                    }
                </div>
                ${images.length > 1 ? `
                    <div class="detail-gallery-thumbs">
                        ${images.map((img, idx) => `
                            <div class="thumb-node ${idx === 0 ? 'active' : ''}" onclick="switchAdvertDetailImage('${img}', this)">
                                ${(img.startsWith('http') || img.startsWith('data:')) ? 
                                    `<img src="${img}" alt="Thumbnail">` : 
                                    `<i class="fas ${img.startsWith('fa-') ? img : 'fa-rectangle-ad'}"></i>`
                                }
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="detail-badge">${badge}</div>
            </div>

            <div class="detail-card">
                <div class="condition-badge ${condition.toLowerCase().includes('new') ? 'new' : 'used'}" style="margin-bottom: 10px;">${condition}</div>
                <h1>${title}</h1>
                <p class="detail-short">${shortDesc}</p>
                ${price ? `<div class="detail-price">¥${price}</div>` : ''}
                <p class="detail-description">${description}</p>

                <div class="detail-list">
                    ${details.map(item => `<div class="detail-item"><i class="fas fa-check-circle"></i><span>${item}</span></div>`).join('')}
                </div>

                <div class="detail-actions">
                    ${ad.link && ad.link.startsWith('http') ? 
                        `<button class="primary-btn" type="button" onclick="window.open('${ad.link}', '_blank')">${cta}</button>` : 
                        `<button class="primary-btn buy-now-btn" data-ad-id="${ad.id}" data-item-type="ad" type="button">Start Inquiry</button>`
                    }
                    <button class="secondary-btn add-to-cart-ad" data-ad-id="${ad.id}" type="button">Add to RFQ</button>
                </div>
            </div>
        </section>
    `;
}

function renderProductDetail(productId) {
    let product = mockProducts.find(p => String(p.id) === String(productId));

    if (!product) {
        product = featuredAds.find(ad => String(ad.id) === String(productId));
        if (product) {
            return renderAdvertDetail(productId);
        }
        return pages.home();
    }

    const images = (product.images && product.images.length > 0) 
        ? product.images 
        : (product.imageUrl ? [product.imageUrl] : [product.image || product.icon || 'fa-image']);

    const condition = product.condition || 'New';
    const price = Number(product.price || 0).toFixed(2);
    const company = product.company || 'Electronics Supplier';
    const name = product.name || product.title || 'Electronic Component';
    const description = product.description || 'Verified authentic electronics item sourced directly from certified manufacturers on 1688 Mart.';
    const rawDetails = product.manufacturerDetails || product.details || [
        'Direct shipping from manufacturer',
        'Quality guaranteed by 1688 Electronic Mart Inspection'
    ];
    const detailsList = Array.isArray(rawDetails) ? rawDetails : [rawDetails];

    return `
        <section class="product-detail page-enter">
            <button class="back-button" type="button">
                <i class="fas fa-arrow-left"></i>
                Back
            </button>

            <div class="detail-hero">
                <div class="fav-overlay-detail ${favorites.some(f => String(f.id) === String(product.id)) ? 'active' : ''}" data-fav-id="${product.id}" data-fav-type="prod">
                    <i class="fas fa-heart"></i>
                </div>
                <div class="detail-gallery-main" id="product-gallery-main">
                    ${(images[0].startsWith('http') || images[0].startsWith('data:')) ? 
                        `<img id="product-main-img" src="${images[0]}" alt="${name}">` : 
                        `<i id="product-main-img" class="fas ${images[0].startsWith('fa-') ? images[0] : 'fa-image'} fa-4x" style="color: var(--primary-color);"></i>`
                    }
                </div>
                ${images.length > 1 ? `
                    <div class="detail-gallery-thumbs">
                        ${images.map((img, idx) => `
                            <div class="thumb-node ${idx === 0 ? 'active' : ''}" onclick="switchProductDetailImage('${img}', this)">
                                ${(img.startsWith('http') || img.startsWith('data:')) ? 
                                    `<img src="${img}" alt="Thumbnail">` : 
                                    `<i class="fas ${img.startsWith('fa-') ? img : 'fa-image'}"></i>`
                                }
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                <div class="detail-badge">Recommended</div>
            </div>

            <div class="detail-card">
                <div class="condition-badge ${condition.toLowerCase().includes('new') ? 'new' : 'used'}" style="margin-bottom: 10px;">${condition}</div>
                <h1>${name}</h1>
                <p class="detail-company">${company}</p>
                <div class="detail-price">¥${price}</div>
                ${product.wholesalePrice ? `<div class="detail-wholesale-price" style="color: #666; font-size: 14px; margin-top: -8px; margin-bottom: 12px;">Wholesale: ¥${Number(product.wholesalePrice).toFixed(2)}</div>` : ''}
                ${product.moq ? `<div class="detail-moq" style="background: #f0f0f0; display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-bottom: 12px;">MOQ: ${product.moq} units</div>` : ''}
                <p class="detail-description">${description}</p>

                <div class="detail-list">
                    ${detailsList.map(item => `<div class="detail-item"><i class="fas fa-check-circle"></i><span>${item}</span></div>`).join('')}
                </div>

                <div class="detail-actions">
                    <button class="primary-btn buy-now-btn" data-product-id="${product.id}" data-item-type="prod" type="button">Start Inquiry / Buy</button>
                    <button class="secondary-btn add-to-cart-prod" data-product-id="${product.id}" type="button">Add to RFQ</button>
                </div>
            </div>
        </section>
    `;
}

function updateActiveNav(pageId) {
    const profileSubPages = ['orders', 'address', 'security', 'help', 'about', 'favorites', 'footprints', 'followed'];
    const targetPage = (pageId === 'advert-detail' || pageId === 'product-detail' || pageId === 'checkout-success') ? 'home' :
                       (profileSubPages.includes(pageId) ? 'profile' : pageId);

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === targetPage) {
            item.classList.add('active');
        }
    });
}

function navigate(pageId, itemId = null, category = null, sortBy = 'default', updateUrl = true) {
    const content = document.getElementById('app-content');
    const mainHeader = document.querySelector('.header');
    const bottomNav = document.querySelector('.bottom-nav');

    // Update URL Hash for Persistence
    if (updateUrl) {
        let hash = `#/${pageId}`;
        if (itemId) hash += `/${itemId}`;
        const params = new URLSearchParams();
        if (category) params.set('cat', category);
        if (sortBy !== 'default') params.set('sort', sortBy);
        const paramStr = params.toString();
        if (paramStr) hash += `?${paramStr}`;

        // Prevent recursive trigger from hashchange listener
        window.history.pushState(null, null, hash);
    }

    // Reset potential state from previous navigation
    document.body.classList.remove('chat-mode');

    // Show/Hide main site navigation elements
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

    // Determine if loading is needed (tab switches)
    const isTabSwitch = ['home', 'cart', 'message', 'profile'].includes(pageId) && !itemId && !category && sortBy === 'default';

    // Only show loader if content is currently empty or very different
    if (isTabSwitch && (!content.innerHTML || content.innerHTML.length < 100)) {
        content.innerHTML = `<div class="loading-container"><div class="spinner"></div></div>`;
    }

    // Apply fade-out transition
    content.style.opacity = '0';
    content.style.transform = 'translateY(10px)';
    content.style.transition = 'opacity 0.2s ease, transform 0.2s ease';

    const delay = isTabSwitch ? 600 : 200;

    setTimeout(() => {
        try {
            // Clear transform to prevent breaking 'fixed' positioning inside content
            if (pageId === 'chat') {
                content.style.transform = 'none';
            }

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
        // Only re-apply transform if NOT in chat mode to avoid layout issues
        if (pageId !== 'chat') {
            content.style.transform = 'translateY(0)';
        }

        updateActiveNav(pageId);
    }, delay);
}

document.getElementById('app-content').addEventListener('click', (event) => {
    const promoSlide = event.target.closest('.promo-carousel .carousel-slide');
    if (promoSlide && promoSlide.dataset.adId) {
        if (event.target.closest('.fav-overlay')) return;
        const adId = promoSlide.dataset.adId;
        const ad = featuredAds.find(a => String(a.id) === String(adId));
        if (ad && ad.link && ad.link.startsWith('http')) {
            window.open(ad.link, '_blank');
        } else {
            navigate('advert-detail', adId);
        }
        return;
    }

    const advertCard = event.target.closest('.advert-card');
    if (advertCard) {
        // Prevent click if clicking the favorite overlay
        if (event.target.closest('.fav-overlay')) return;
        navigate('advert-detail', advertCard.dataset.adId);
        return;
    }

    const productCard = event.target.closest('.product-card');
    if (productCard) {
        // Prevent click if clicking the favorite overlay
        if (event.target.closest('.fav-overlay')) return;
        const type = productCard.dataset.itemType;
        const itemId = productCard.dataset.productId || productCard.dataset.adId;
        if (type === 'ad') {
            navigate('advert-detail', itemId);
        } else {
            navigate('product-detail', itemId);
        }
        return;
    }

    const buyNowBtn = event.target.closest('.buy-now-btn');
    if (buyNowBtn) {
        const id = buyNowBtn.dataset.productId || buyNowBtn.dataset.adId;
        const type = buyNowBtn.dataset.itemType || (buyNowBtn.dataset.productId ? 'prod' : 'ad');

        if (type === 'ad') {
            const ad = featuredAds.find(a => String(a.id) === String(id));
            if (ad) {
                startChatWithSupplier(ad.title || 'Special Offer', 'ad');
                return;
            }
        }

        if (addToCart(id, type)) {
            navigate('cart');
        }
        return;
    }

    const favBtn = event.target.closest('.fav-overlay, .fav-overlay-detail');
    if (favBtn) {
        toggleFavorite(favBtn.dataset.favId, favBtn.dataset.favType);
        favBtn.classList.toggle('active');
        return;
    }

    const footprintItem = event.target.closest('.footprint-item');
    if (footprintItem) {
        const type = footprintItem.dataset.itemType;
        if (type === 'ad') {
            navigate('advert-detail', footprintItem.dataset.productId);
        } else {
            navigate('product-detail', footprintItem.dataset.productId);
        }
        return;
    }

    const sourcingTool = event.target.closest('.grid-item');
    if (sourcingTool && sourcingTool.dataset.nav) {
        navigate(sourcingTool.dataset.nav);
        return;
    }

    const backButton = event.target.closest('.back-button');
    if (backButton) {
        const navBack = backButton.dataset.navBack;
        navigate(navBack || 'home');
        return;
    }

    if (event.target.closest('.go-shopping')) {
        navigate('home');
        return;
    }

    const orderFilterBtn = event.target.closest('.order-filter-btn');
    if (orderFilterBtn) {
        navigate('orders', orderFilterBtn.dataset.status);
        return;
    }

    const viewAllOrders = event.target.closest('.view-all-orders');
    if (viewAllOrders) {
        navigate('orders', 'all');
        return;
    }

    const clearHistory = event.target.closest('.clear-history-btn');
    if (clearHistory) {
        recentSearches = [];
        localStorage.removeItem('recentSearches');
        const content = document.getElementById('app-content');
        if (content && content.querySelector('.home-page')) content.innerHTML = pages.home();
        return;
    }

    const faqItem = event.target.closest('.faq-list .service-item, .security .service-item');
    if (faqItem && !faqItem.dataset.service) {
        alert(`Information for "${faqItem.innerText.trim()}" is coming soon! Our factory policy is being updated.`);
        return;
    }

    const serviceItem = event.target.closest('.service-item');
    if (serviceItem && serviceItem.dataset.service) {
        navigate(serviceItem.dataset.service);
        return;
    }

    const chatItem = event.target.closest('.chat-item');
    if (chatItem) {
        navigate('chat', chatItem.dataset.chatId);
        return;
    }

    const addAddressBtn = event.target.closest('.add-address-btn');
    if (addAddressBtn) {
        addressFormState = { mode: 'new', id: null };
        navigate('address');
        return;
    }

    const editAddressBtn = event.target.closest('.edit-address');
    if (editAddressBtn) {
        addressFormState = { mode: 'edit', id: Number(editAddressBtn.dataset.addressId) };
        navigate('address');
        return;
    }

    const deleteAddressBtn = event.target.closest('.delete-address');
    if (deleteAddressBtn) {
        const id = Number(deleteAddressBtn.dataset.addressId);
        addresses = addresses.filter(address => address.id !== id);
        if (addresses.length === 0) {
            addressFormState = { mode: 'new', id: null };
        }
        navigate('address');
        return;
    }

    const cancelAddressBtn = event.target.closest('.cancel-address-btn');
    if (cancelAddressBtn) {
        addressFormState = { mode: 'new', id: null };
        navigate('address');
        return;
    }

    const deleteAccountBtn = event.target.closest('.delete-account-item');
    if (deleteAccountBtn) {
        deleteAccount();
        return;
    }

    const removeBtn = event.target.closest('.remove-btn');
    if (removeBtn) {
        removeFromCart(removeBtn.dataset.removeId);
        return;
    }

    const addAdBtn = event.target.closest('.add-to-cart-ad');
    if (addAdBtn) {
        addToCart(addAdBtn.dataset.adId, 'ad');
        return;
    }

    const addProdBtn = event.target.closest('.add-to-cart-prod');
    if (addProdBtn) {
        addToCart(addProdBtn.dataset.productId, 'prod');
        return;
    }

    const uploadInput = event.target.closest('.profile-upload-input');
    if (uploadInput) {
        const file = uploadInput.files && uploadInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function () {
            profileImage = reader.result;
            try {
                localStorage.setItem('profileImage', profileImage);
            } catch (error) {
                // Ignore storage issues in restricted browsers.
            }
            navigate('profile');
        };
        reader.readAsDataURL(file);
        return;
    }

    const sendBtn = event.target.closest('.send-btn');
    if (sendBtn) {
        const chatWindow = document.querySelector('.chat-window');
        const chatId = chatWindow ? mockMessages.find(m => document.body.innerText.includes(m.sender))?.id : null;
        if (chatId) sendMessage(chatId);
        return;
    }

    const shopNowBtn = event.target.closest('.shop-now-btn');
    if (shopNowBtn) {
        document.getElementById('recommended-section').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const viewDealsBtn = event.target.closest('.view-deals-btn');
    if (viewDealsBtn) {
        document.getElementById('featured-deals-section').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    const goHomeBtn = event.target.closest('.go-home-btn');
    if (goHomeBtn) {
        navigate('home');
        return;
    }

    const clearSearchBtn = event.target.closest('.clear-search-btn');
    if (clearSearchBtn) {
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
        navigate('home');
        return;
    }
});

document.getElementById('search-input').addEventListener('input', (e) => {
    const query = e.target.value;
    const content = document.getElementById('app-content');
    const isHome = content.querySelector('.home-page');

    if (query.length > 2 && !recentSearches.includes(query)) {
        // Debounced ideally, but here we add on enter or after delay
    }

    if (isHome) {
        content.innerHTML = pages.home(query);
        updateActiveNav('home');
    } else {
        navigate('home', query);
    }
});

document.getElementById('search-input').addEventListener('focus', () => {
    const historyDropdown = document.getElementById('search-history-container');
    if (historyDropdown && recentSearches.length > 0) {
        historyDropdown.style.display = 'block';
    }
});

document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (query && !recentSearches.includes(query)) {
            recentSearches.unshift(query);
            if (recentSearches.length > 8) recentSearches.pop();
            localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
        }
        const historyDropdown = document.getElementById('search-history-container');
        if (historyDropdown) historyDropdown.style.display = 'none';
        e.target.blur();
    }
});

// Click outside to close search history
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-bar') && !e.target.closest('.search-history-dropdown')) {
        const historyDropdown = document.getElementById('search-history-container');
        if (historyDropdown) historyDropdown.style.display = 'none';
    }
});

document.getElementById('app-content').addEventListener('change', (event) => {
    const uploadInput = event.target.closest('.profile-upload-input');
    if (!uploadInput) return;

    const file = uploadInput.files && uploadInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function () {
        profileImage = reader.result;
        try {
            localStorage.setItem('profileImage', profileImage);
        } catch (error) {
            // Ignore storage issues in restricted browsers.
        }
        navigate('profile');
    };
    reader.readAsDataURL(file);
});

document.getElementById('app-content').addEventListener('submit', (event) => {
    if (event.target.matches('#address-form')) {
        event.preventDefault();
        saveAddress(new FormData(event.target));
    }
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker Registered!', reg))
            .catch(err => console.log('Service Worker Failed!', err));
    });
}

// Carousel Auto-play
setInterval(() => {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.indicator-dot');
    if (slides.length < 2) return;

    let activeIdx = Array.from(slides).findIndex(s => s.classList.contains('active'));
    if (activeIdx === -1) activeIdx = 0;
    slides[activeIdx].classList.remove('active');
    if (dots[activeIdx]) dots[activeIdx].classList.remove('active');

    let nextIdx = (activeIdx + 1) % slides.length;
    slides[nextIdx].classList.add('active');
    if (dots[nextIdx]) dots[nextIdx].classList.add('active');
}, 5000);

// Routing Engine for Page Persistence
function handleRouting() {
    const hash = window.location.hash || '#/home';
    const [pathPart, queryPart] = hash.replace('#/', '').split('?');
    const segments = pathPart.split('/');

    const pageId = segments[0] || 'home';
    const itemId = segments[1] || null;

    const params = new URLSearchParams(queryPart || '');
    const category = params.get('cat');
    const sortBy = params.get('sort') || 'default';

    // Navigate without updating the URL again
    navigate(pageId, itemId, category, sortBy, false);
}

window.addEventListener('popstate', handleRouting);

// --- APP INITIALIZATION ---

auth.onAuthStateChanged((user) => {
    currentUser = user;

    // Refresh UI if user is on an auth-dependent page
    const content = document.getElementById('app-content');
    if (content) {
        if (content.querySelector('.profile-page')) navigate('profile', null, null, 'default', false);
        if (content.querySelector('.message-page')) navigate('message', null, null, 'default', false);
    }

    if (user) {
        const userRef = db.collection("users").doc(user.uid);
        userRef.set({
            id: user.uid,
            name: user.displayName,
            email: user.email,
            photo: user.photoURL,
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        userRef.onSnapshot(doc => {
            if (doc.exists) {
                userData = doc.data();
                const businessSection = document.getElementById('business-info-section');
                if (businessSection) {
                    businessSection.innerHTML = renderBusinessInfoContent();
                }
            }
        });

        rtdb.ref("chats").on("value", (snapshot) => {
            const data = snapshot.val();
            if (data) {
                userChats = Object.values(data).filter(chat => chat.userName === user.displayName || chat.id.includes(user.uid));
                const content = document.getElementById('app-content');
                if (content && content.querySelector('.message-page')) navigate('message');
            }
        });
    }
});

// Real-time Listeners
db.collection("products").onSnapshot((snapshot) => {
    mockProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    saveData();
    renderHomePageIfActive();
});

db.collection("categories").onSnapshot((snapshot) => {
    if (!snapshot.empty) {
        mockCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        saveData();
        renderHomePageIfActive();
    }
});

db.collection("adverts").onSnapshot((snapshot) => {
    if (snapshot && !snapshot.empty) {
        featuredAds = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        saveData();
        renderHomePageIfActive();
    }
}, (err) => {
    console.warn("Firestore ads offline:", err);
});

// Deployment updates
rtdb.ref("system/deployment").on("value", (snapshot) => {
    const data = snapshot.val();
    if (data) {
        const now = new Date().getTime();
        // If it's a recent signal, apply patch
        if (now - data.last_updated_at < 60000) applyHotPatch(data);
    }
});

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            navigate(item.dataset.page);
        });
    });
    handleRouting();
});
