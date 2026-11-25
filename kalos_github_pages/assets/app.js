'use strict';

/* Kalos Business — application statique pour GitHub Pages.
 * Toutes les données sont simulées et stockées dans le localStorage.
 */

const LS = {
  users: 'kalos_users',
  session: 'kalos_session',
  cart: 'kalos_cart',
  orders: 'kalos_orders',
  messages: 'kalos_messages',
  settings: 'kalos_settings',
  stock: 'kalos_stock',
  checkout: 'kalos_checkout',
  promo: 'kalos_promo',
};

const ui = { category: '', search: '', sort: 'recent', page: 1, payment: 'card' };

let DATA = null;
let state = null;

/* ------------------------------ Utilitaires ------------------------------ */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function money(value) {
  return round2(value).toFixed(2).replace('.', ',') + ' ' + state.settings.currency;
}

function nowString() {
  return new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function randomCode(length) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function makeOrderRef() {
  return 'KLB-' + new Date().getFullYear() + '-' + randomCode(6);
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function toast(message, type) {
  const zone = document.getElementById('alert-zone');
  zone.innerHTML =
    '<div class="container pt-3"><div class="alert alert-' + (type || 'success') +
    ' alert-dismissible fade show" role="alert">' + esc(message) +
    '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fermer"></button></div></div>';
}

/* ------------------------------- État local ------------------------------ */

function initState() {
  const defaults = DATA.site;
  let users = read(LS.users, null);
  if (!Array.isArray(users) || users.length === 0) {
    users = [
      { username: 'admin', email: 'admin@kalosbusiness.test', password: 'KalosAdmin2026!', is_staff: true, created_at: 'Compte de démonstration' },
      { username: 'demo', email: 'demo@kalosbusiness.test', password: 'Kalos2026!', is_staff: false, created_at: 'Compte de démonstration' },
    ];
    write(LS.users, users);
  }

  const settings = Object.assign({}, defaults, read(LS.settings, {}));
  settings.shop_open = settings.shop_open === true || settings.shop_open === '1' || settings.shop_open === 1;

  state = {
    users: users,
    session: read(LS.session, ''),
    cart: read(LS.cart, []),
    orders: read(LS.orders, []),
    messages: read(LS.messages, []),
    settings: settings,
    stock: read(LS.stock, {}),
    checkout: read(LS.checkout, {}),
    promoApplied: read(LS.promo, false),
  };
}

function currentUser() {
  return state.users.find((u) => u.username === state.session) || null;
}

function isAdmin() {
  const user = currentUser();
  return Boolean(user && user.is_staff);
}

function productById(id) {
  return DATA.products.find((p) => p.id === Number(id)) || null;
}

function productBySlug(slug) {
  return DATA.products.find((p) => p.slug === slug) || null;
}

function getStock(product) {
  if (!product) return 0;
  return Object.prototype.hasOwnProperty.call(state.stock, product.id)
    ? state.stock[product.id]
    : product.stock;
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.qty, 0);
}

function calcTotals() {
  let subtotal = 0;
  state.cart.forEach((item) => {
    const product = productById(item.id);
    if (product) subtotal += product.price * item.qty;
  });
  subtotal = round2(subtotal);
  const globalDiscount = round2(subtotal * (Number(state.settings.global_discount) || 0) / 100);
  const afterGlobal = round2(subtotal - globalDiscount);
  const promoDiscount = state.promoApplied
    ? round2(afterGlobal * (Number(state.settings.promo_percent) || 0) / 100)
    : 0;
  const afterPromo = round2(afterGlobal - promoDiscount);
  const shipping = afterPromo >= Number(state.settings.free_shipping_threshold)
    ? 0
    : Number(state.settings.shipping_fee);
  return {
    subtotal: subtotal,
    globalDiscount: globalDiscount,
    promoDiscount: promoDiscount,
    shipping: round2(shipping),
    total: round2(afterPromo + shipping),
  };
}

function addToCart(id) {
  const product = productById(id);
  if (!product) return;
  if (!state.settings.shop_open) {
    toast('La boutique est temporairement fermée aux commandes.', 'warning');
    return;
  }
  const existing = state.cart.find((item) => item.id === product.id);
  const current = existing ? existing.qty : 0;
  if (current >= getStock(product)) {
    toast('Stock insuffisant pour ' + product.name + '.', 'warning');
    return;
  }
  if (existing) existing.qty += 1;
  else state.cart.push({ id: product.id, qty: 1 });
  write(LS.cart, state.cart);
  toast(product.name + ' ajouté au panier.');
  render();
}

function changeQty(id, delta) {
  const item = state.cart.find((i) => i.id === Number(id));
  if (!item) return;
  const product = productById(item.id);
  const next = item.qty + delta;
  if (next <= 0) {
    state.cart = state.cart.filter((i) => i.id !== Number(id));
  } else if (product && next > getStock(product)) {
    toast('Stock maximal atteint pour ' + product.name + '.', 'warning');
    return;
  } else {
    item.qty = next;
  }
  write(LS.cart, state.cart);
  render();
}

function removeFromCart(id) {
  state.cart = state.cart.filter((i) => i.id !== Number(id));
  write(LS.cart, state.cart);
  render();
}

/* ------------------------------ Validation ------------------------------- */

function luhn(number) {
  const digits = String(number).replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (alternate) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function cardBrand(number) {
  const digits = String(number).replace(/\D/g, '');
  if (/^4/.test(digits)) return 'Visa';
  if (/^5[1-5]/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^6/.test(digits)) return 'Discover';
  return 'Carte';
}

function validExpiry(value) {
  const match = String(value).trim().match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

/* ------------------------------- Layout ---------------------------------- */

function navbar() {
  const user = currentUser();
  const count = cartCount();
  const categories = DATA.categories.map((category) =>
    '<li><button class="dropdown-item" data-action="category" data-slug="' + esc(category.slug) + '">' +
    esc(category.icon) + ' ' + esc(category.name) + '</button></li>'
  ).join('');

  const accountBlock = user
    ? '<li class="nav-item me-lg-2">' +
        (user.is_staff
          ? '<a class="nav-link text-warning fw-semibold" href="#/tableau-de-bord"><i class="bi bi-speedometer2 me-1"></i>Administration</a>'
          : '') +
      '</li><li class="nav-item dropdown">' +
      '<a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">' +
      '<i class="bi bi-person-circle me-1"></i>' + esc(user.username) +
      (user.is_staff ? '<span class="badge bg-warning text-dark ms-1">Admin</span>' : '') + '</a>' +
      '<ul class="dropdown-menu dropdown-menu-dark dropdown-menu-lg-end">' +
      (user.is_staff ? '<li><a class="dropdown-item" href="#/tableau-de-bord"><i class="bi bi-speedometer2 me-2"></i>Tableau de bord</a></li>' : '') +
      '<li><a class="dropdown-item" href="#/commandes"><i class="bi bi-box-seam me-2"></i>Mes commandes</a></li>' +
      '<li><a class="dropdown-item" href="#/compte"><i class="bi bi-person me-2"></i>Mon compte</a></li>' +
      '<li><a class="dropdown-item" href="#/contact"><i class="bi bi-envelope me-2"></i>Messagerie</a></li>' +
      '<li><hr class="dropdown-divider"></li>' +
      '<li><button class="dropdown-item" data-action="logout"><i class="bi bi-box-arrow-right me-2"></i>Déconnexion</button></li>' +
      '</ul></li>'
    : '<li class="nav-item"><a class="nav-link" href="#/connexion">Connexion</a></li>' +
      '<li class="nav-item"><a class="btn btn-kalos btn-sm ms-lg-2" href="#/inscription">Inscription</a></li>';

  return '<nav class="navbar navbar-expand-lg kalos-navbar sticky-top"><div class="container">' +
    '<a class="navbar-brand" href="#/"><i class="bi bi-gem me-2"></i>' + esc(state.settings.name) + '</a>' +
    '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#kalosNav" aria-controls="kalosNav" aria-expanded="false" aria-label="Menu"><span class="navbar-toggler-icon"></span></button>' +
    '<div class="collapse navbar-collapse" id="kalosNav"><ul class="navbar-nav me-auto mb-2 mb-lg-0">' +
    '<li class="nav-item"><a class="nav-link" href="#/">Accueil</a></li>' +
    '<li class="nav-item"><a class="nav-link" href="#/boutique">Boutique</a></li>' +
    '<li class="nav-item dropdown"><a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">Catégories</a>' +
    '<ul class="dropdown-menu dropdown-menu-dark">' + categories + '</ul></li>' +
    '<li class="nav-item"><a class="nav-link" href="#/a-propos">À propos</a></li>' +
    '<li class="nav-item"><a class="nav-link" href="#/contact">Contact</a></li>' +
    '</ul><ul class="navbar-nav ms-auto align-items-lg-center">' +
    '<li class="nav-item me-lg-3"><a class="nav-link position-relative" href="#/panier"><i class="bi bi-bag fs-5"></i>' +
    '<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-warning text-dark">' + count + '</span></a></li>' +
    accountBlock + '</ul></div></div></nav>';
}

function footer() {
  return '<div class="container"><div class="row gy-4">' +
    '<div class="col-md-4"><h5 class="text-white"><i class="bi bi-gem me-2"></i>' + esc(state.settings.name) + '</h5><p class="small">' + esc(state.settings.tagline) + '</p></div>' +
    '<div class="col-md-4"><h6 class="text-white">Navigation</h6><ul class="list-unstyled small">' +
    '<li><a href="#/boutique">Tous les produits</a></li><li><a href="#/a-propos">À propos</a></li>' +
    '<li><a href="#/contact">Nous contacter</a></li><li><a href="#/commandes">Mes commandes</a></li></ul></div>' +
    '<div class="col-md-4"><h6 class="text-white">Nous joindre</h6>' +
    '<p class="small mb-1"><i class="bi bi-envelope me-2"></i>' + esc(state.settings.email) + '</p>' +
    '<p class="small mb-1"><i class="bi bi-telephone me-2"></i>' + esc(state.settings.phone) + '</p>' +
    '<p class="small"><i class="bi bi-shield-check me-2"></i>Paiement simulé sécurisé</p></div></div>' +
    '<hr class="border-secondary my-4"><p class="small text-center mb-0">© ' + new Date().getFullYear() + ' ' + esc(state.settings.name) + '. Tous droits réservés.</p></div>';
}

function banners() {
  let html = '';
  if (!state.settings.shop_open) {
    html += '<div class="alert alert-warning text-center"><i class="bi bi-exclamation-triangle me-2"></i>La boutique est temporairement fermée aux commandes.</div>';
  }
  html += '<div class="alert alert-kalos-note small"><i class="bi bi-info-circle me-2"></i>' +
    'Version de démonstration : les données (comptes, panier, commandes, messages) sont enregistrées dans ce navigateur uniquement.</div>';
  return html;
}

/* --------------------------- Cartes produits ----------------------------- */

function categoryCard(category) {
  return '<div class="col-6 col-md-4 col-lg-3"><button class="category-card w-100 h-100 text-start p-3" data-action="category" data-slug="' + esc(category.slug) + '">' +
    '<div class="category-icon">' + esc(category.icon) + '</div>' +
    '<h6 class="mt-3 mb-1">' + esc(category.name) + '</h6>' +
    '<small class="text-muted">' + esc(category.product_count) + ' produit' + (category.product_count > 1 ? 's' : '') + '</small>' +
    '</button></div>';
}

function productCard(product) {
  const stock = getStock(product);
  const badge = product.badge
    ? '<span class="badge-kalos">' + esc({ new: 'Nouveau', sale: 'Promotion', hit: 'Best-seller' }[product.badge] || product.badge) + '</span>'
    : '';
  const discount = product.old_price && product.old_price > product.price
    ? '<span class="discount-kalos">-' + Math.round(((product.old_price - product.price) / product.old_price) * 100) + '%</span>'
    : '';
  const image = product.image_url
    ? '<img src="' + esc(product.image_url) + '" alt="' + esc(product.name) + '">'
    : '<div class="product-placeholder"><span>✦</span></div>';
  const oldPrice = product.old_price && product.old_price > product.price
    ? '<del class="small text-muted ms-2">' + money(product.old_price) + '</del>'
    : '';

  return '<div class="col-6 col-md-4 col-lg-3"><div class="card product-card h-100">' +
    '<a href="#/produit/' + esc(product.slug) + '" class="product-image">' + image + badge + discount + '</a>' +
    '<div class="card-body p-3"><h6 class="card-title"><a href="#/produit/' + esc(product.slug) + '">' + esc(product.name) + '</a></h6>' +
    '<small class="text-muted d-block mb-2">' + esc(product.category_name) + '</small>' +
    '<div><span class="price-kalos">' + money(product.price) + '</span>' + oldPrice + '</div>' +
    '<button class="btn btn-kalos btn-sm w-100 mt-3" data-action="add" data-id="' + product.id + '"' + (stock <= 0 ? ' disabled' : '') + '>' +
    (stock > 0 ? '<i class="bi bi-bag-plus me-1"></i>Ajouter' : 'Épuisé') + '</button></div></div></div>';
}

/* --------------------------------- Vues ---------------------------------- */

function viewHome() {
  const featured = DATA.products.filter((p) => p.is_featured).slice(0, 4);
  const list = featured.length ? featured : DATA.products.slice(0, 4);
  return '<div class="hero-kalos mb-5"><div class="row align-items-center"><div class="col-lg-8">' +
    '<h1>' + esc(state.settings.name) + '</h1><p class="lead mb-4">' + esc(state.settings.tagline) + '</p>' +
    '<a href="#/boutique" class="btn btn-kalos btn-lg"><i class="bi bi-stars me-2"></i>Découvrir la boutique</a>' +
    '</div><div class="col-lg-4 text-center d-none d-lg-block" style="font-size:6rem;color:#c8a13a">✦</div></div></div>' +
    '<h2 class="section-title h4 mb-4">Nos catégories</h2><div class="row g-3 mb-5">' + DATA.categories.map(categoryCard).join('') + '</div>' +
    '<h2 class="section-title h4 mb-4">À la une</h2><div class="row g-4">' + list.map(productCard).join('') + '</div>';
}

function visibleProducts() {
  let list = DATA.products.slice();
  if (ui.category) list = list.filter((p) => p.category === ui.category);
  if (ui.search) {
    const needle = ui.search.toLowerCase();
    list = list.filter((p) =>
      (p.name + ' ' + p.short_description + ' ' + p.category_name).toLowerCase().includes(needle));
  }
  if (ui.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  else if (ui.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  else if (ui.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else list.sort((a, b) => b.id - a.id);
  return list;
}

function viewCatalog() {
  const perPage = 8;
  const list = visibleProducts();
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  if (ui.page > pages) ui.page = pages;
  const pageItems = list.slice((ui.page - 1) * perPage, ui.page * perPage);
  const categoryOptions = ['<option value="">Toutes les catégories</option>'].concat(
    DATA.categories.map((c) => '<option value="' + esc(c.slug) + '"' + (ui.category === c.slug ? ' selected' : '') + '>' + esc(c.name) + '</option>')
  ).join('');
  const sortOptions = [
    ['recent', 'Plus récents'], ['price-asc', 'Prix croissant'],
    ['price-desc', 'Prix décroissant'], ['name', 'Nom A–Z'],
  ].map(([value, label]) => '<option value="' + value + '"' + (ui.sort === value ? ' selected' : '') + '>' + label + '</option>').join('');

  const pagination = pages > 1
    ? '<nav class="mt-4"><ul class="pagination justify-content-center">' +
      Array.from({ length: pages }, (_, index) => index + 1).map((n) =>
        '<li class="page-item' + (n === ui.page ? ' active' : '') + '"><button class="page-link" data-action="page" data-page="' + n + '">' + n + '</button></li>'
      ).join('') + '</ul></nav>'
    : '';

  return '<h1 class="section-title h3 mb-4">La boutique</h1>' +
    '<div class="row g-3 mb-4 align-items-end"><div class="col-md-5">' +
    '<form data-form="search-form"><label class="form-label small">Rechercher</label><div class="input-group">' +
    '<input type="search" name="q" class="form-control" placeholder="Produit, catégorie…" value="' + esc(ui.search) + '">' +
    '<button class="btn btn-outline-kalos" type="submit"><i class="bi bi-search"></i></button></div></form></div>' +
    '<div class="col-md-3"><label class="form-label small">Catégorie</label><select class="form-select" data-change="category">' + categoryOptions + '</select></div>' +
    '<div class="col-md-3"><label class="form-label small">Trier par</label><select class="form-select" data-change="sort">' + sortOptions + '</select></div>' +
    '<div class="col-md-1"><div class="small text-muted text-md-end">' + list.length + ' produit' + (list.length > 1 ? 's' : '') + '</div></div></div>' +
    (pageItems.length ? '<div class="row g-4">' + pageItems.map(productCard).join('') + '</div>' + pagination
      : '<div class="alert alert-info">Aucun produit ne correspond à votre recherche.</div>');
}

function viewProduct(slug) {
  const product = productBySlug(slug);
  if (!product) return '<div class="alert alert-warning">Produit introuvable. <a href="#/boutique">Retour à la boutique</a>.</div>';
  const stock = getStock(product);
  const image = product.image_url
    ? '<img src="' + esc(product.image_url) + '" class="img-fluid rounded" alt="' + esc(product.name) + '">'
    : '<div class="product-placeholder rounded" style="height:380px"><span>✦</span></div>';
  const related = DATA.products.filter((p) => p.category === product.category && p.id !== product.id).slice(0, 4);
  const oldPrice = product.old_price && product.old_price > product.price
    ? '<del class="h5 text-muted ms-3">' + money(product.old_price) + '</del>' : '';

  return '<nav aria-label="fil d’Ariane"><ol class="breadcrumb small"><li class="breadcrumb-item"><a href="#/">Accueil</a></li>' +
    '<li class="breadcrumb-item"><a href="#/boutique">Boutique</a></li><li class="breadcrumb-item active">' + esc(product.name) + '</li></ol></nav>' +
    '<div class="row g-5"><div class="col-lg-6">' + image + '</div><div class="col-lg-6">' +
    '<span class="badge bg-secondary mb-2">' + esc(product.category_name) + '</span>' +
    '<h1 class="section-title h3">' + esc(product.name) + '</h1>' +
    '<p class="text-muted">' + esc(product.short_description) + '</p>' +
    '<div class="mb-4"><span class="h3 price-kalos">' + money(product.price) + '</span>' + oldPrice + '</div>' +
    '<p>' + esc(product.description || 'Un produit choisi avec soin par Kalos Business.') + '</p>' +
    '<p class="small ' + (stock > 3 ? 'text-success' : 'text-danger') + '"><i class="bi bi-box me-1"></i>' +
    (stock > 0 ? stock + ' en stock' : 'Momentanément épuisé') + '</p>' +
    '<button class="btn btn-kalos btn-lg" data-action="add" data-id="' + product.id + '"' + (stock <= 0 ? ' disabled' : '') + '>' +
    '<i class="bi bi-bag-plus me-2"></i>' + (stock > 0 ? 'Ajouter au panier' : 'Épuisé') + '</button>' +
    '<a href="#/panier" class="btn btn-outline-kalos btn-lg ms-2">Voir le panier</a></div></div>' +
    (related.length ? '<h2 class="section-title h5 mt-5 mb-4">Vous aimerez aussi</h2><div class="row g-4">' + related.map(productCard).join('') + '</div>' : '');
}

function cartLine(item) {
  const product = productById(item.id);
  if (!product) return '';
  const image = product.image_url
    ? '<img src="' + esc(product.image_url) + '" alt="" style="width:70px;height:70px;object-fit:cover;border-radius:.5rem">'
    : '<div class="bg-secondary rounded d-grid place-items-center" style="width:70px;height:70px;color:#c8a13a;font-size:1.6rem">✦</div>';
  return '<tr><td>' + image + '</td><td><a class="text-decoration-none fw-semibold" href="#/produit/' + esc(product.slug) + '">' + esc(product.name) + '</a>' +
    '<div class="small text-muted">' + money(product.price) + ' l’unité</div></td>' +
    '<td><div class="btn-group btn-group-sm"><button class="btn btn-outline-secondary" data-action="qty-minus" data-id="' + product.id + '">−</button>' +
    '<span class="btn btn-light disabled">' + item.qty + '</span>' +
    '<button class="btn btn-outline-secondary" data-action="qty-plus" data-id="' + product.id + '">+</button></div></td>' +
    '<td class="text-end">' + money(product.price * item.qty) + '</td>' +
    '<td class="text-end"><button class="btn btn-sm btn-outline-danger" data-action="remove" data-id="' + product.id + '"><i class="bi bi-trash"></i></button></td></tr>';
}

function viewCart() {
  if (!state.cart.length) {
    return '<h1 class="section-title h3 mb-4">Votre panier</h1><div class="alert alert-info">Votre panier est vide. <a href="#/boutique">Découvrir la boutique</a>.</div>';
  }
  const totals = calcTotals();
  return '<h1 class="section-title h3 mb-4">Votre panier</h1><div class="row g-4"><div class="col-lg-8">' +
    '<div class="table-responsive"><table class="table align-middle"><tbody>' + state.cart.map(cartLine).join('') + '</tbody></table></div></div>' +
    '<div class="col-lg-4"><div class="summary-box p-4"><h5 class="mb-3">Récapitulatif</h5>' +
    '<div class="d-flex justify-content-between mb-2"><span>Sous-total</span><span>' + money(totals.subtotal) + '</span></div>' +
    (totals.globalDiscount ? '<div class="d-flex justify-content-between mb-2 text-success"><span>Remise globale</span><span>−' + money(totals.globalDiscount) + '</span></div>' : '') +
    (totals.promoDiscount ? '<div class="d-flex justify-content-between mb-2 text-success"><span>Code promo</span><span>−' + money(totals.promoDiscount) + '</span></div>' : '') +
    '<div class="d-flex justify-content-between mb-2"><span>Livraison</span><span>' + (totals.shipping === 0 ? 'Offerte' : money(totals.shipping)) + '</span></div>' +
    '<hr><div class="d-flex justify-content-between h5"><span>Total</span><span>' + money(totals.total) + '</span></div>' +
    '<form data-form="promo-form" class="mt-4"><label class="form-label small">Code promo</label><div class="input-group">' +
    '<input name="code" class="form-control" value="' + esc(state.promoApplied ? state.settings.promo_code : '') + '" placeholder="' + esc(state.settings.promo_code) + '">' +
    '<button class="btn btn-outline-kalos" type="submit">Appliquer</button></div></form>' +
    '<button class="btn btn-kalos w-100 mt-3" data-action="go-checkout"><i class="bi bi-arrow-right me-2"></i>Passer commande</button>' +
    '</div></div></div>';
}

function checkoutValue(name) {
  return esc(state.checkout[name] || (currentUser() && name === 'email' ? currentUser().email : ''));
}

function viewCheckout() {
  if (!state.cart.length) {
    return '<div class="alert alert-warning">Votre panier est vide. <a href="#/boutique">Ajouter des produits</a>.</div>';
  }
  return '<h1 class="section-title h3 mb-4">Livraison</h1><div class="row g-4"><div class="col-lg-7">' +
    '<form data-form="checkout-form" class="card summary-box p-4"><div class="row g-3">' +
    '<div class="col-12"><label class="form-label">Nom complet *</label><input name="full_name" class="form-control" required value="' + checkoutValue('full_name') + '"></div>' +
    '<div class="col-md-6"><label class="form-label">E-mail *</label><input type="email" name="email" class="form-control" required value="' + checkoutValue('email') + '"></div>' +
    '<div class="col-md-6"><label class="form-label">Téléphone</label><input name="phone" class="form-control" value="' + checkoutValue('phone') + '"></div>' +
    '<div class="col-12"><label class="form-label">Adresse *</label><input name="address" class="form-control" required value="' + checkoutValue('address') + '"></div>' +
    '<div class="col-md-4"><label class="form-label">Ville *</label><input name="city" class="form-control" required value="' + checkoutValue('city') + '"></div>' +
    '<div class="col-md-4"><label class="form-label">Code postal</label><input name="postal_code" class="form-control" value="' + checkoutValue('postal_code') + '"></div>' +
    '<div class="col-md-4"><label class="form-label">Pays</label><input name="country" class="form-control" value="' + esc(state.checkout.country || state.settings.country) + '"></div>' +
    '<div class="col-12"><label class="form-label">Notes</label><textarea name="notes" class="form-control" rows="3">' + checkoutValue('notes') + '</textarea></div>' +
    '</div><button class="btn btn-kalos mt-4">Continuer vers le paiement <i class="bi bi-arrow-right ms-2"></i></button></form></div>' +
    '<div class="col-lg-5"><div class="summary-box p-4"><h5>Votre commande</h5>' +
    state.cart.map((item) => { const p = productById(item.id); return '<div class="d-flex justify-content-between small border-bottom py-2"><span>' + item.qty + ' × ' + esc(p.name) + '</span><span>' + money(p.price * item.qty) + '</span></div>'; }).join('') +
    '<div class="d-flex justify-content-between h5 mt-3"><span>Total</span><span>' + money(calcTotals().total) + '</span></div></div></div></div>';
}

function paymentMethodCard(method, icon, title, text) {
  return '<div class="payment-method-card' + (ui.payment === method ? ' active' : '') + '" data-action="payment" data-method="' + method + '">' +
    '<div class="form-check"><input class="form-check-input" type="radio" name="method" ' + (ui.payment === method ? 'checked' : '') + ' readonly>' +
    '<label class="form-check-label fw-semibold"><i class="bi ' + icon + ' me-2"></i>' + title + '</label></div>' +
    '<div class="small text-muted mt-1 ps-4">' + text + '</div></div>';
}

function paymentFields() {
  if (ui.payment === 'card') {
    return '<div class="row g-3 mt-4"><div class="col-12"><label class="form-label">Numéro de carte</label>' +
      '<input name="card_number" class="form-control" inputmode="numeric" placeholder="4242 4242 4242 4242" required></div>' +
      '<div class="col-md-6"><label class="form-label">Expiration</label><input name="expiry" class="form-control" placeholder="MM/AA" required></div>' +
      '<div class="col-md-6"><label class="form-label">CVC</label><input name="cvc" class="form-control" inputmode="numeric" placeholder="123" required></div></div>';
  }
  if (ui.payment === 'paypal') {
    return '<div class="mt-4"><label class="form-label">Adresse e-mail PayPal</label>' +
      '<input type="email" name="paypal_email" class="form-control" placeholder="vous@exemple.com" required>' +
      '<p class="small text-muted mt-2">Vous confirmerez le paiement en cliquant sur le bouton ci-dessous.</p></div>';
  }
  return '<div class="alert alert-kalos-note mt-4 mb-0"><i class="bi bi-truck me-2"></i>Le règlement sera effectué au moment de la livraison. Aucune donnée bancaire n’est demandée.</div>';
}

function viewPayment() {
  if (!state.cart.length) return '<div class="alert alert-warning">Votre panier est vide. <a href="#/boutique">Ajouter des produits</a>.</div>';
  const totals = calcTotals();
  const buttonLabel = ui.payment === 'cod' ? 'Confirmer la commande' : ui.payment === 'paypal' ? 'Confirmer avec PayPal' : 'Payer par carte';

  return '<h1 class="section-title h3 mb-4">Paiement</h1><div class="alert alert-kalos-note"><i class="bi bi-shield-check me-2"></i>' +
    'Paiement simulé : aucun débit ni appel réseau n’est effectué.</div>' +
    '<div class="row g-4"><div class="col-lg-7"><h5 class="mb-3">Moyen de paiement</h5>' +
    '<div class="d-grid gap-3">' +
    paymentMethodCard('card', 'bi-credit-card', 'Carte bancaire', 'Validation du numéro, de l’expiration et du CVC.') +
    paymentMethodCard('paypal', 'bi-paypal', 'PayPal', 'Confirmation avec votre adresse e-mail PayPal.') +
    paymentMethodCard('cod', 'bi-truck', 'Paiement à la livraison', 'Règlement au moment de la réception.') +
    '</div><form data-form="payment-form" class="card summary-box p-4 mt-4">' + paymentFields() +
    '<button class="btn btn-kalos btn-lg w-100 mt-4">' + buttonLabel + ' — ' + money(totals.total) + '</button>' +
    '<a href="#/commande" class="btn btn-link w-100 mt-2 small">Modifier les coordonnées de livraison</a></form></div>' +
    '<div class="col-lg-5"><div class="summary-box p-4"><h5>Récapitulatif</h5>' +
    state.cart.map((item) => { const p = productById(item.id); return '<div class="d-flex justify-content-between small border-bottom py-2"><span>' + item.qty + ' × ' + esc(p.name) + '</span><span>' + money(p.price * item.qty) + '</span></div>'; }).join('') +
    '<div class="d-flex justify-content-between mt-3"><span>Sous-total</span><span>' + money(totals.subtotal) + '</span></div>' +
    (totals.globalDiscount ? '<div class="d-flex justify-content-between text-success"><span>Remise globale</span><span>−' + money(totals.globalDiscount) + '</span></div>' : '') +
    (totals.promoDiscount ? '<div class="d-flex justify-content-between text-success"><span>Code promo</span><span>−' + money(totals.promoDiscount) + '</span></div>' : '') +
    '<div class="d-flex justify-content-between"><span>Livraison</span><span>' + (totals.shipping ? money(totals.shipping) : 'Offerte') + '</span></div>' +
    '<hr><div class="d-flex justify-content-between h4"><span>Total</span><span>' + money(totals.total) + '</span></div></div></div></div>';
}

function viewConfirmation(reference) {
  const order = state.orders.find((o) => o.reference === reference);
  if (!order) return '<div class="alert alert-warning">Commande introuvable.</div>';
  return '<div class="text-center mb-5"><div class="display-1 text-success"><i class="bi bi-check-circle"></i></div>' +
    '<h1 class="section-title h3">Commande confirmée !</h1><p class="text-muted">Merci ' + esc(order.customer.full_name) + ', votre commande <strong>' + esc(order.reference) + '</strong> est enregistrée.</p></div>' +
    '<div class="row g-4"><div class="col-lg-7"><div class="summary-box p-4"><h5>Articles</h5>' +
    order.items.map((item) => '<div class="d-flex justify-content-between border-bottom py-2"><span>' + item.qty + ' × ' + esc(item.name) + '</span><span>' + money(item.line_total) + '</span></div>').join('') +
    '<div class="d-flex justify-content-between h4 mt-3"><span>Total payé</span><span>' + money(order.total) + '</span></div></div></div>' +
    '<div class="col-lg-5"><div class="summary-box p-4"><h5>Détails</h5>' +
    '<p class="small mb-1"><strong>Référence :</strong> ' + esc(order.reference) + '</p>' +
    '<p class="small mb-1"><strong>Date :</strong> ' + esc(order.created_at) + '</p>' +
    '<p class="small mb-1"><strong>Paiement :</strong> ' + esc({ card: 'Carte bancaire', paypal: 'PayPal', cod: 'Paiement à la livraison' }[order.payment_method]) + '</p>' +
    '<p class="small mb-1"><strong>Transaction :</strong> ' + esc(order.transaction_ref) + '</p>' +
    '<p class="small"><strong>Statut :</strong> ' + esc(order.status === 'paid' ? 'Payée' : 'Confirmée — paiement à la livraison') + '</p>' +
    '<a href="#/boutique" class="btn btn-kalos w-100 mt-3">Continuer mes achats</a></div></div></div>';
}

function viewLogin() {
  return '<div class="row justify-content-center"><div class="col-md-6 col-lg-5"><div class="card summary-box p-4">' +
    '<h1 class="section-title h4 mb-4">Connexion</h1><form data-form="login-form">' +
    '<div class="mb-3"><label class="form-label">Identifiant</label><input name="username" class="form-control" required autocomplete="username"></div>' +
    '<div class="mb-3"><label class="form-label">Mot de passe</label><input type="password" name="password" class="form-control" required autocomplete="current-password"></div>' +
    '<button class="btn btn-kalos w-100">Se connecter</button></form>' +
    '<p class="small text-muted mt-3 mb-0">Pas encore de compte ? <a href="#/inscription">Créer un compte</a>.</p>' +
    '<div class="alert alert-kalos-note small mt-3 mb-0">Comptes de démonstration : admin / KalosAdmin2026! — demo / Kalos2026!</div>' +
    '</div></div></div>';
}

function viewRegister() {
  return '<div class="row justify-content-center"><div class="col-md-6 col-lg-5"><div class="card summary-box p-4">' +
    '<h1 class="section-title h4 mb-4">Créer un compte</h1><form data-form="register-form">' +
    '<div class="mb-3"><label class="form-label">Identifiant *</label><input name="username" class="form-control" required minlength="3"></div>' +
    '<div class="mb-3"><label class="form-label">E-mail *</label><input type="email" name="email" class="form-control" required></div>' +
    '<div class="mb-3"><label class="form-label">Mot de passe * (6 caractères minimum)</label><input type="password" name="password" class="form-control" required minlength="6"></div>' +
    '<button class="btn btn-kalos w-100">Créer mon compte</button></form>' +
    '<p class="small text-muted mt-3 mb-0">Déjà inscrit ? <a href="#/connexion">Se connecter</a>.</p>' +
    '<div class="alert alert-kalos-note small mt-3 mb-0">Le compte est enregistré dans ce navigateur uniquement.</div>' +
    '</div></div></div>';
}

function viewAccount() {
  const user = currentUser();
  if (!user) return '<div class="alert alert-info">Veuillez <a href="#/connexion">vous connecter</a> pour accéder à votre compte.</div>';
  const myOrders = state.orders.filter((o) => o.customer.email === user.email);
  return '<h1 class="section-title h3 mb-4">Mon compte</h1><div class="row g-4"><div class="col-md-5">' +
    '<div class="summary-box p-4"><h5>' + esc(user.username) + '</h5>' +
    '<p class="small text-muted mb-1">' + esc(user.email) + '</p>' +
    '<p class="small text-muted">Membre depuis ' + esc(user.created_at) + '</p>' +
    '<a href="#/commandes" class="btn btn-outline-kalos w-100 mt-2"><i class="bi bi-box-seam me-2"></i>Mes commandes (' + myOrders.length + ')</a>' +
    (user.is_staff ? '<a href="#/tableau-de-bord" class="btn btn-kalos w-100 mt-2">Tableau de bord admin</a>' : '') +
    '</div></div><div class="col-md-7"><div class="summary-box p-4"><h5>Activité récente</h5>' +
    (myOrders.length ? myOrders.slice(0, 3).map((o) => '<div class="d-flex justify-content-between border-bottom py-2 small"><span>' + esc(o.reference) + '</span><span>' + money(o.total) + '</span></div>').join('')
      : '<p class="text-muted small mb-0">Aucune commande pour le moment.</p>') +
    '</div></div></div>';
}

function viewMyOrders() {
  const user = currentUser();
  if (!user) return '<div class="alert alert-info">Veuillez <a href="#/connexion">vous connecter</a> pour voir vos commandes.</div>';
  const orders = state.orders.filter((o) => o.customer.email === user.email);
  if (!orders.length) return '<h1 class="section-title h3 mb-4">Mes commandes</h1><div class="alert alert-info">Aucune commande. <a href="#/boutique">Découvrir la boutique</a>.</div>';
  return '<h1 class="section-title h3 mb-4">Mes commandes</h1><div class="table-responsive"><table class="table table-kalos align-middle">' +
    '<thead><tr><th>Référence</th><th>Date</th><th>Paiement</th><th>Statut</th><th class="text-end">Total</th><th></th></tr></thead><tbody>' +
    orders.map((o) => '<tr><td>' + esc(o.reference) + '</td><td>' + esc(o.created_at) + '</td><td>' + esc(o.payment_method) + '</td>' +
      '<td><span class="badge bg-success">' + esc(o.status) + '</span></td><td class="text-end">' + money(o.total) + '</td>' +
      '<td class="text-end"><a class="btn btn-sm btn-outline-kalos" href="#/confirmation/' + esc(o.reference) + '">Voir</a></td></tr>').join('') +
    '</tbody></table></div>';
}

function viewContact() {
  const user = currentUser();
  return '<h1 class="section-title h3 mb-4">Nous contacter</h1><div class="row g-4"><div class="col-lg-7">' +
    '<div class="card summary-box p-4"><form data-form="contact-form">' +
    '<div class="row g-3"><div class="col-md-6"><label class="form-label">Nom *</label><input name="name" class="form-control" required value="' + esc(user ? user.username : '') + '"></div>' +
    '<div class="col-md-6"><label class="form-label">E-mail *</label><input type="email" name="email" class="form-control" required value="' + esc(user ? user.email : '') + '"></div>' +
    '<div class="col-12"><label class="form-label">Sujet *</label><input name="subject" class="form-control" required></div>' +
    '<div class="col-12"><label class="form-label">Message *</label><textarea name="body" class="form-control" rows="5" required></textarea></div></div>' +
    '<button class="btn btn-kalos mt-4">Envoyer le message</button></form></div></div>' +
    '<div class="col-lg-5"><div class="summary-box p-4"><h5>Nos coordonnées</h5>' +
    '<p class="small"><i class="bi bi-envelope me-2"></i>' + esc(state.settings.email) + '</p>' +
    '<p class="small"><i class="bi bi-telephone me-2"></i>' + esc(state.settings.phone) + '</p>' +
    '<p class="small text-muted">Un lien privé de suivi vous sera affiché après l’envoi.</p></div></div></div>';
}

function viewThread(token) {
  const message = state.messages.find((m) => m.token === token);
  if (!message) return '<div class="alert alert-warning">Conversation introuvable.</div>';
  return '<h1 class="section-title h3 mb-4">Conversation</h1><div class="card summary-box p-4">' +
    '<p class="small text-muted">' + esc(message.created_at) + ' — ' + esc(message.status) + '</p>' +
    '<h5>' + esc(message.subject) + '</h5><p><strong>' + esc(message.name) + ' :</strong><br>' + esc(message.body) + '</p>' +
    (message.reply_text
      ? '<div class="alert alert-success"><strong>Réponse de Kalos Business :</strong><br>' + esc(message.reply_text) + '</div>'
      : '<div class="alert alert-secondary small">Pas encore de réponse.</div>') +
    (isAdmin()
      ? '<form data-form="reply-form" class="mt-4"><input type="hidden" name="token" value="' + esc(message.token) + '">' +
        '<label class="form-label">Répondre</label><textarea name="reply" class="form-control" rows="3" required>' + esc(message.reply_text || '') + '</textarea>' +
        '<button class="btn btn-kalos mt-3">Envoyer la réponse</button></form>'
      : '<a href="#/contact" class="btn btn-outline-kalos mt-3">Nouveau message</a>') +
    '</div>';
}

function settingInput(name, label, value, type) {
  const inputType = type || 'text';
  return '<div class="col-md-6"><label class="form-label">' + label + '</label>' +
    '<input type="' + inputType + '" name="' + name + '" class="form-control" value="' + esc(value) + '"></div>';
}

function viewDashboard() {
  if (!isAdmin()) return '<div class="alert alert-danger">Accès réservé aux administrateurs. <a href="#/connexion">Se connecter</a>.</div>';
  const revenue = state.orders.reduce((sum, o) => sum + (o.status === 'paid' ? o.total : 0), 0);
  const lowStock = DATA.products.filter((p) => getStock(p) <= 3);

  return '<h1 class="section-title h3 mb-4">Tableau de bord</h1>' +
    '<div class="row g-3 mb-4">' +
    [['Produits', DATA.products.length], ['Commandes', state.orders.length], ['Messages', state.messages.length], ['Utilisateurs', state.users.length], ['Chiffre d’affaires', money(revenue)]].map(([label, value]) =>
      '<div class="col-6 col-lg-3"><div class="summary-box p-3 text-center"><div class="h4 mb-1">' + esc(value) + '</div><div class="small text-muted">' + esc(label) + '</div></div></div>').join('') +
    '</div><div class="row g-4"><div class="col-lg-7">' +
    '<div class="summary-box p-4 mb-4"><h5>Commandes récentes</h5>' +
    (state.orders.length ? '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Réf.</th><th>Client</th><th class="text-end">Total</th></tr></thead><tbody>' +
      state.orders.slice(0, 5).map((o) => '<tr><td><a href="#/confirmation/' + esc(o.reference) + '">' + esc(o.reference) + '</a></td><td>' + esc(o.customer.full_name) + '</td><td class="text-end">' + money(o.total) + '</td></tr>').join('') +
      '</tbody></table></div>' : '<p class="small text-muted mb-0">Aucune commande.</p>') + '</div>' +
    '<div class="summary-box p-4"><h5>Messagerie</h5>' +
    (state.messages.length ? state.messages.slice(0, 5).map((m) => '<div class="d-flex justify-content-between border-bottom py-2 small"><span>' + esc(m.subject) + '</span><a href="#/messagerie/' + esc(m.token) + '">Ouvrir</a></div>').join('')
      : '<p class="small text-muted mb-0">Aucun message.</p>') + '</div></div>' +
    '<div class="col-lg-5"><div class="summary-box p-4 mb-4"><h5>Alertes stock</h5>' +
    (lowStock.length ? lowStock.map((p) => '<div class="d-flex justify-content-between small border-bottom py-2"><span>' + esc(p.name) + '</span><span class="text-danger">' + getStock(p) + '</span></div>').join('')
      : '<p class="small text-muted mb-0">Aucune alerte.</p>') + '</div>' +
    '<div class="summary-box p-4"><h5>Paramètres de l’application</h5>' +
    '<form data-form="settings-form"><div class="row g-3">' +
    settingInput('name', 'Nom du site', state.settings.name) +
    settingInput('tagline', 'Slogan', state.settings.tagline) +
    settingInput('currency', 'Devise', state.settings.currency) +
    settingInput('email', 'E-mail de contact', state.settings.email) +
    settingInput('phone', 'Téléphone', state.settings.phone) +
    settingInput('country', 'Pays par défaut', state.settings.country) +
    settingInput('shipping_fee', 'Frais de livraison', state.settings.shipping_fee, 'number') +
    settingInput('free_shipping_threshold', 'Seuil livraison offerte', state.settings.free_shipping_threshold, 'number') +
    settingInput('global_discount', 'Remise globale (%)', state.settings.global_discount, 'number') +
    settingInput('promo_code', 'Code promo', state.settings.promo_code) +
    settingInput('promo_percent', 'Remise code promo (%)', state.settings.promo_percent, 'number') +
    '<div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" name="shop_open"' + (state.settings.shop_open ? ' checked' : '') + '>' +
    '<label class="form-check-label">Boutique ouverte aux commandes</label></div></div>' +
    '</div><button class="btn btn-kalos w-100 mt-4">Enregistrer les paramètres</button></form></div></div></div>' +
    '<div class="mt-4"><a href="#/boutique" class="btn btn-outline-kalos me-2">Voir la boutique</a>' +
    '<a href="#/commandes" class="btn btn-outline-kalos">Mes commandes</a></div>';
}

function viewAbout() {
  return '<h1 class="section-title h3 mb-4">À propos</h1><div class="row justify-content-center"><div class="col-lg-8">' +
    '<p class="lead">' + esc(state.settings.name) + ' — ' + esc(state.settings.tagline) + '</p>' +
    '<p>Boutique de démonstration inspirée d’un site e-commerce complet : catalogue, panier, commandes, paiements simulés, messagerie et tableau de bord administrateur.</p>' +
    '<p>Cette version est publiée sur GitHub Pages : elle fonctionne entièrement dans votre navigateur, sans serveur Django ni base de données centrale.</p>' +
    '<a href="#/boutique" class="btn btn-kalos">Voir les produits</a></div></div>';
}

/* -------------------------------- Routing -------------------------------- */

function render() {
  if (!DATA || !state) return;
  const hash = (location.hash || '#/').slice(1);
  const path = hash.split('?')[0];
  const parts = path.split('/').filter(Boolean);
  let html = '';

  switch (parts[0]) {
    case undefined: html = viewHome(); break;
    case 'boutique': html = viewCatalog(); break;
    case 'produit': html = viewProduct(parts[1]); break;
    case 'panier': html = viewCart(); break;
    case 'commande': html = viewCheckout(); break;
    case 'paiement': html = viewPayment(); break;
    case 'confirmation': html = viewConfirmation(parts[1]); break;
    case 'connexion': html = viewLogin(); break;
    case 'inscription': html = viewRegister(); break;
    case 'compte': html = viewAccount(); break;
    case 'commandes': html = viewMyOrders(); break;
    case 'contact': html = viewContact(); break;
    case 'messagerie': html = viewThread(parts[1]); break;
    case 'tableau-de-bord': html = viewDashboard(); break;
    case 'a-propos': html = viewAbout(); break;
    default: html = viewHome();
  }

  document.getElementById('navbar').innerHTML = navbar();
  document.getElementById('footer').innerHTML = footer();
  document.getElementById('app').innerHTML = banners() + html;
  window.scrollTo(0, 0);
}

/* ------------------------------- Événements ------------------------------ */

function onClick(event) {
  const element = event.target.closest('[data-action]');
  if (!element) return;
  const action = element.dataset.action;

  if (action === 'category') {
    ui.category = element.dataset.slug;
    ui.page = 1;
    go('#/boutique');
  } else if (action === 'page') {
    ui.page = Number(element.dataset.page);
    render();
  } else if (action === 'add') {
    addToCart(Number(element.dataset.id));
  } else if (action === 'qty-plus') {
    changeQty(Number(element.dataset.id), 1);
  } else if (action === 'qty-minus') {
    changeQty(Number(element.dataset.id), -1);
  } else if (action === 'remove') {
    removeFromCart(Number(element.dataset.id));
  } else if (action === 'payment') {
    ui.payment = element.dataset.method;
    render();
  } else if (action === 'go-checkout') {
    if (!state.cart.length) {
      toast('Votre panier est vide.', 'warning');
      return;
    }
    go('#/commande');
  } else if (action === 'logout') {
    state.session = '';
    write(LS.session, '');
    toast('Vous êtes déconnecté.');
    go('#/');
  }
}

function onChange(event) {
  const target = event.target;
  if (target.dataset.change === 'category') {
    ui.category = target.value;
    ui.page = 1;
    render();
  } else if (target.dataset.change === 'sort') {
    ui.sort = target.value;
    ui.page = 1;
    render();
  }
}

function processPayment(formData) {
  if (!state.cart.length) {
    toast('Votre panier est vide.', 'warning');
    return;
  }
  if (!state.checkout.full_name || !state.checkout.email || !state.checkout.address) {
    toast('Renseignez d’abord les coordonnées de livraison.', 'warning');
    go('#/commande');
    return;
  }

  const method = ui.payment;
  let transactionRef = '';
  let paymentMethod = method;
  let status = 'paid';

  if (method === 'card') {
    const number = String(formData.get('card_number') || '');
    const expiry = String(formData.get('expiry') || '');
    const cvc = String(formData.get('cvc') || '');
    if (!luhn(number)) {
      toast('Numéro de carte invalide (contrôle de Luhn).', 'danger');
      return;
    }
    if (!validExpiry(expiry)) {
      toast('Date d’expiration invalide (format MM/AA).', 'danger');
      return;
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      toast('CVC invalide.', 'danger');
      return;
    }
    transactionRef = 'CB-' + randomCode(8) + '-' + number.replace(/\D/g, '').slice(-4);
    paymentMethod = 'card (' + cardBrand(number) + ' •••• ' + number.replace(/\D/g, '').slice(-4) + ')';
  } else if (method === 'paypal') {
    const email = String(formData.get('paypal_email') || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      toast('Adresse e-mail PayPal invalide.', 'danger');
      return;
    }
    transactionRef = 'PP-' + randomCode(10);
  } else {
    transactionRef = 'COD-' + randomCode(8);
    status = 'cod_confirmed';
  }

  const totals = calcTotals();
  const items = state.cart.map((item) => {
    const product = productById(item.id);
    return {
      id: product.id,
      name: product.name,
      unit_price: product.price,
      qty: item.qty,
      line_total: round2(product.price * item.qty),
    };
  });

  const order = {
    reference: makeOrderRef(),
    customer: Object.assign({}, state.checkout),
    items: items,
    subtotal: totals.subtotal,
    discount: round2(totals.globalDiscount + totals.promoDiscount),
    shipping: totals.shipping,
    total: totals.total,
    payment_method: paymentMethod,
    transaction_ref: transactionRef,
    status: status,
    created_at: nowString(),
  };

  state.orders.unshift(order);
  items.forEach((item) => {
    const product = productById(item.id);
    state.stock[product.id] = Math.max(0, getStock(product) - item.qty);
  });
  write(LS.stock, state.stock);
  write(LS.orders, state.orders);
  state.cart = [];
  state.promoApplied = false;
  write(LS.cart, state.cart);
  write(LS.promo, state.promoApplied);

  toast('Commande ' + order.reference + ' confirmée !');
  go('#/confirmation/' + order.reference);
}

function onSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  switch (form.dataset.form) {
    case 'search-form':
      ui.search = String(formData.get('q') || '').trim();
      ui.page = 1;
      go('#/boutique');
      break;

    case 'promo-form': {
      const code = String(formData.get('code') || '').trim().toUpperCase();
      if (code === String(state.settings.promo_code || '').toUpperCase()) {
        state.promoApplied = true;
        toast('Code promo appliqué : −' + state.settings.promo_percent + ' %.');
      } else {
        state.promoApplied = false;
        toast('Code promo invalide.', 'warning');
      }
      write(LS.promo, state.promoApplied);
      render();
      break;
    }

    case 'checkout-form': {
      const fields = ['full_name', 'email', 'phone', 'address', 'city', 'postal_code', 'country', 'notes'];
      const checkout = {};
      fields.forEach((field) => { checkout[field] = String(formData.get(field) || ''); });
      state.checkout = checkout;
      write(LS.checkout, checkout);
      go('#/paiement');
      break;
    }

    case 'payment-form':
      processPayment(formData);
      break;

    case 'login-form': {
      const username = String(formData.get('username') || '').trim();
      const password = String(formData.get('password') || '');
      const user = state.users.find((u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
      if (!user) {
        toast('Identifiant ou mot de passe incorrect.', 'danger');
        return;
      }
      state.session = user.username;
      write(LS.session, state.session);
      toast('Bon retour, ' + user.username + ' !');
      go(user.is_staff ? '#/tableau-de-bord' : '#/');
      break;
    }

    case 'register-form': {
      const username = String(formData.get('username') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '');
      if (state.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        toast('Cet identifiant existe déjà.', 'danger');
        return;
      }
      if (state.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
        toast('Cette adresse e-mail est déjà utilisée.', 'danger');
        return;
      }
      state.users.push({
        username: username,
        email: email,
        password: password,
        is_staff: false,
        created_at: nowString(),
      });
      write(LS.users, state.users);
      state.session = username;
      write(LS.session, username);
      toast('Compte créé. Bienvenue, ' + username + ' !');
      go('#/compte');
      break;
    }

    case 'contact-form': {
      const token = 'msg-' + randomCode(8).toLowerCase();
      state.messages.unshift({
        token: token,
        name: String(formData.get('name') || ''),
        email: String(formData.get('email') || ''),
        subject: String(formData.get('subject') || ''),
        body: String(formData.get('body') || ''),
        reply_text: '',
        status: 'open',
        created_at: nowString(),
      });
      write(LS.messages, state.messages);
      toast('Message envoyé.');
      go('#/messagerie/' + token);
      break;
    }

    case 'reply-form': {
      const token = String(formData.get('token') || '');
      const message = state.messages.find((m) => m.token === token);
      if (!message) return;
      message.reply_text = String(formData.get('reply') || '');
      message.status = 'answered';
      write(LS.messages, state.messages);
      toast('Réponse enregistrée.');
      render();
      break;
    }

    case 'settings-form': {
      const keys = ['name', 'tagline', 'currency', 'email', 'phone', 'country', 'shipping_fee',
        'free_shipping_threshold', 'global_discount', 'promo_code', 'promo_percent'];
      keys.forEach((key) => { state.settings[key] = String(formData.get(key) || ''); });
      state.settings.shop_open = Boolean(formData.get('shop_open'));
      write(LS.settings, state.settings);
      toast('Paramètres enregistrés.');
      render();
      break;
    }

    default:
      break;
  }
}

/* --------------------------------- Boot ---------------------------------- */

async function boot() {
  try {
    const response = await fetch('assets/data.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    DATA = await response.json();
    initState();
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('change', onChange);
    window.addEventListener('hashchange', render);
    render();
  } catch (error) {
    document.getElementById('app').innerHTML =
      '<div class="alert alert-danger">Impossible de charger les données : ' + esc(error.message) + '</div>';
  }
}

boot();
