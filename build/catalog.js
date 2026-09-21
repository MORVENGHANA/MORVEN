const catalogApi = window.MORVEN_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);

function renderProductCard(product, dashboard) {
  const article = document.createElement('article');
  article.className = dashboard ? 'shop-product' : 'product';
  const image = document.createElement('div');
  image.className = `product-image product-${product.id}`;
  if (product.imageUrl) {
    image.classList.add('has-uploaded-image');
    image.style.backgroundImage = `url(${product.imageUrl})`;
  }
  image.innerHTML = `<span>${product.id}</span><div class="shape"></div><b>${product.name.toUpperCase()}</b>`;
  const title = document.createElement('h2');
  title.textContent = product.name;
  const description = document.createElement('p');
  description.textContent = product.description || 'MORVEN essential';
  const price = document.createElement('strong');
  price.textContent = `GH₵${product.price}`;
  if (dashboard) {
    article.append(image, title, description, price);
    const button = document.createElement('button');
    button.className = 'add-button'; button.dataset.product = product.name; button.dataset.price = product.price; button.textContent = 'Add to cart +';
    article.append(button);
  } else {
    const meta = document.createElement('div');
    meta.className = 'product-meta';
    const detail = document.createElement('div');
    const metaTitle = document.createElement('h3'); metaTitle.textContent = product.name;
    const metaDescription = document.createElement('p'); metaDescription.textContent = product.description || 'MORVEN essential';
    detail.append(metaTitle, metaDescription); meta.append(detail, price); article.append(image, meta);
  }
  return article;
}

fetch(`${catalogApi}/api/products`)
  .then((response) => response.ok ? response.json() : Promise.reject(new Error('Catalog unavailable')))
  .then(({ products }) => {
    const dashboardProducts = document.querySelector('.dashboard-products');
    const homepageProducts = document.querySelector('.products');
    if (dashboardProducts) { dashboardProducts.replaceChildren(...products.map((product) => renderProductCard(product, true))); }
    if (homepageProducts) { homepageProducts.replaceChildren(...products.map((product) => renderProductCard(product, false))); }
    document.dispatchEvent(new Event('catalog:updated'));
  })
  .catch(() => {});
