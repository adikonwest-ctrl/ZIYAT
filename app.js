const state = {
  site: null,
  people: [],
  encyclopedia: [],
  archaeology: [],
  mapPlaces: [],
  map: null,
  mapLayer: null,
  selectedPlaceId: null
};

function setActiveNav() {
  const links = document.querySelectorAll('.main-nav a');

  const activateLink = () => {
    const offset = 120;
    let currentId = 'home';

    document.querySelectorAll('section[id]').forEach(section => {
      const rect = section.getBoundingClientRect();
      if (rect.top - offset <= 0 && rect.bottom > 0) {
        currentId = section.id;
      }
    });

    links.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.toggle('active', href === `#${currentId}`);
    });
  };

  activateLink();
  window.addEventListener('scroll', activateLink, { passive: true });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${url}`);
  }
  return response.json();
}

function renderSiteMetadata() {
  const { site } = state;
  if (!site) return;

  const title = document.getElementById('site-title');
  const tagline = document.getElementById('site-tagline');
  const description = document.getElementById('site-description');
  const summary = document.getElementById('site-summary');
  const heroVisual = document.querySelector('.hero-visual');

  if (title) title.textContent = site.title;
  if (tagline) tagline.textContent = site.tagline;
  if (description) description.textContent = site.description;
  if (summary) summary.textContent = site.description;

  if (heroVisual && site.heroImage) {
    heroVisual.style.background = `linear-gradient(160deg, rgba(18, 47, 39, 0.12), rgba(18, 47, 39, 0.32)), url('${site.heroImage}') center/cover no-repeat`;
  }
}

function renderPeople() {
  const grid = document.getElementById('people-grid');
  if (!grid) return;

  grid.innerHTML = state.people.map(person => `
    <article class="card visual-card">
      ${person.image ? `<img class="card-image" src="${person.image}" alt="${person.name}" loading="lazy" />` : ''}
      <span class="meta">${person.role}</span>
      <h3>${person.name}</h3>
      <div class="tagline">${person.period || 'Исторический период'}</div>
      <p>${person.summary}</p>
    </article>
  `).join('');
}

function renderEncyclopedia() {
  const grid = document.getElementById('encyclopedia-grid');
  if (!grid) return;

  grid.innerHTML = state.encyclopedia.map(item => `
    <article class="card visual-card">
      ${item.image ? `<img class="card-image" src="${item.image}" alt="${item.title}" loading="lazy" />` : ''}
      <span class="meta">${item.type}</span>
      <h3>${item.title}</h3>
      <div class="tagline">${item.subtitle}</div>
      <p>${item.description}</p>
    </article>
  `).join('');
}

function renderArchaeology() {
  const grid = document.getElementById('archaeology-grid');
  if (grid) {
    grid.innerHTML = state.archaeology.map(item => `
      <article class="card">
        <span class="meta">${item.category}</span>
        <h3>${item.title}</h3>
        <p>${item.description}</p>
      </article>
    `).join('');
  }
}

function renderPlacesList() {
  const grid = document.getElementById('places-grid');
  if (!grid) return;

  if (!state.mapPlaces.length) {
    grid.innerHTML = '<div class="empty-state">На этой стадии в проекте нет подтверждённых исторических точек на карте.</div>';
    return;
  }

  grid.innerHTML = state.mapPlaces.map(place => `
    <article class="card visual-card" data-place-id="${place.id}">
      ${place.image ? `<img class="card-image" src="${place.image}" alt="${place.title}" loading="lazy" />` : ''}
      <span class="meta">${place.category}</span>
      <h3>${place.title}</h3>
      <div class="tagline">${place.historicalPeriod}</div>
      <p>${place.description}</p>
    </article>
  `).join('');

  grid.querySelectorAll('[data-place-id]').forEach(card => {
    card.addEventListener('click', () => {
      const placeId = card.dataset.placeId;
      const place = state.mapPlaces.find(item => item.id === placeId);
      if (place) {
        state.selectedPlaceId = placeId;
        const marker = state.mapLayer.getLayers().find(layer => layer.options?.placeId === placeId);
        if (marker) {
          marker.openPopup();
          const bounds = marker.getLatLng();
          state.map.flyTo([bounds.lat, bounds.lng], 13, { duration: 0.8 });
        }
      }
    });
  });
}

function getPlaceCategoryOptions() {
  const categories = [...new Set(state.mapPlaces.map(place => place.category))];
  const filter = document.getElementById('category-filter');
  if (!filter) return;

  filter.innerHTML = '<option value="all">Все категории</option>' + categories.map(category => `
    <option value="${category}">${category}</option>
  `).join('');
}

function renderMapDetails(place) {
  const container = document.getElementById('map-details');
  if (!container) return;

  if (!place) {
    container.innerHTML = '<p>Выберите объект на карте, чтобы увидеть историю и источник.</p>';
    return;
  }

  const imageMarkup = place.image
    ? `<img src="${place.image}" alt="${place.title}" loading="lazy" />`
    : '<div class="empty-state">Изображение временно не доступно.</div>';

  const sourceLink = place.sourceUrl
    ? `<a class="map-link" href="${place.sourceUrl}" target="_blank" rel="noreferrer">Открыть источник</a>`
    : '';

  container.innerHTML = `
    <span class="object-tag">${place.category}</span>
    <h3>${place.title}</h3>
    ${imageMarkup}
    <p>${place.description}</p>
    <ul class="meta-list">
      <li><strong>Период:</strong> ${place.historicalPeriod}</li>
      <li><strong>Координаты:</strong> ${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}</li>
      <li><strong>Источник:</strong> ${place.sourceLabel || 'Проверенный источник не указан'}</li>
    </ul>
    ${sourceLink}
  `;
}

function bindMapInteractions() {
  const mapElement = document.getElementById('map');
  if (!mapElement || typeof L === 'undefined') return;

  const map = L.map(mapElement, {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([50.280, 57.17], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  state.map = map;
  state.mapLayer = L.layerGroup().addTo(map);

  const searchInput = document.getElementById('place-search');
  const categoryFilter = document.getElementById('category-filter');
  const markers = [];

  const renderMarkers = () => {
    state.mapLayer.clearLayers();

    const query = (searchInput?.value || '').trim().toLowerCase();
    const selectedCategory = categoryFilter?.value || 'all';

    const filteredPlaces = state.mapPlaces.filter(place => {
      const matchesQuery = !query || place.title.toLowerCase().includes(query);
      const matchesCategory = selectedCategory === 'all' || place.category === selectedCategory;
      return matchesQuery && matchesCategory;
    });

    filteredPlaces.forEach(place => {
      const marker = L.marker([place.latitude, place.longitude], {
        placeId: place.id
      }).addTo(state.mapLayer);

      marker.bindPopup(`
        <div class="place-popup">
          <h3>${place.title}</h3>
          <p>${place.description}</p>
          <p><strong>Период:</strong> ${place.historicalPeriod}</p>
        </div>
      `);

      marker.on('click', () => {
        state.selectedPlaceId = place.id;
        renderMapDetails(place);
      });

      markers.push(marker);
    });

    if (!filteredPlaces.length) {
      renderMapDetails(null);
      return;
    }

    if (state.selectedPlaceId) {
      const selected = filteredPlaces.find(place => place.id === state.selectedPlaceId);
      if (selected) {
        renderMapDetails(selected);
        return;
      }
    }

    const fallback = filteredPlaces[0];
    renderMapDetails(fallback);
    state.selectedPlaceId = fallback.id;
  };

  searchInput?.addEventListener('input', renderMarkers);
  categoryFilter?.addEventListener('change', renderMarkers);

  getPlaceCategoryOptions();
  renderMarkers();

  setTimeout(() => map.invalidateSize(), 200);
}

async function bootstrap() {
  setActiveNav();

  const [siteData, mapData] = await Promise.all([
    fetchJson('/api/site-data'),
    fetchJson('/api/map-places')
  ]);

  state.site = siteData.site || siteData;
  state.people = siteData.people || [];
  state.encyclopedia = siteData.encyclopedia || [];
  state.archaeology = siteData.archaeology || [];
  state.mapPlaces = mapData || [];

  renderSiteMetadata();
  renderPeople();
  renderEncyclopedia();
  renderArchaeology();
  renderPlacesList();
  bindMapInteractions();
}

document.addEventListener('DOMContentLoaded', bootstrap);
