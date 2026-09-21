const catalogApi = window.MORVEN_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:4000' : window.location.origin);

function renderProductCard(product, dashboard) {
  const article = document.createElement('article');
  article.className = dashboard ? 'shop-product' : 'product';
  const image = document.createElement('div');
  image.className = `product-image product-${product.id}`;
  const imageSources = [product.imageUrl, product.imageBackUrl].filter(Boolean);
  if (imageSources.length) {
    image.classList.add('has-uploaded-image');
    const track = document.createElement('div');
    track.className = 'product-image-track';
    imageSources.forEach((source, index) => {
      const picture = document.createElement('img');
      picture.alt = `${product.name} ${index === 0 ? 'front' : 'back'}`;
      picture.className = 'product-image-slide';
      picture.src = source;
      track.append(picture);
    });
    image.append(track);
    if (imageSources.length > 1) {
      const previous = document.createElement('button');
      previous.className = 'product-image-control previous'; previous.type = 'button'; previous.textContent = '‹'; previous.setAttribute('aria-label', 'Previous product image');
      const next = document.createElement('button');
      next.className = 'product-image-control next'; next.type = 'button'; next.textContent = '›'; next.setAttribute('aria-label', 'Next product image');
      image.append(previous, next);
      let activeIndex = 0;
      const showImage = (nextIndex) => { activeIndex = (nextIndex + imageSources.length) % imageSources.length; track.style.transform = `translateX(-${activeIndex * 100}%)`; };
      previous.addEventListener('click', () => showImage(activeIndex - 1));
      next.addEventListener('click', () => showImage(activeIndex + 1));
      let startX = 0;
      image.addEventListener('pointerdown', (event) => { startX = event.clientX; image.setPointerCapture(event.pointerId); });
      image.addEventListener('pointerup', (event) => { const distance = event.clientX - startX; if (Math.abs(distance) > 35) showImage(activeIndex + (distance < 0 ? 1 : -1)); });
    }
  } else {
    image.innerHTML = '<div class="shape"></div>';
  }
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
