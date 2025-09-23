import { riskEngine } from './RiskEngine.js';

let d3LoadingPromise = null;
let topojsonLoadingPromise = null;

async function loadD3() {
  if (typeof d3 !== 'undefined') return;
  if (d3LoadingPromise) return d3LoadingPromise;

  d3LoadingPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[data-lib="d3"]');
    if (existingScript) {
      existingScript.addEventListener('load', resolve, { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js';
    script.async = true;
    script.dataset.lib = 'd3';
    script.onload = () => resolve();
    script.onerror = () => {
      d3LoadingPromise = null;
      reject(new Error('Failed to load D3 library'));
    };
    document.head.appendChild(script);
  });

  return d3LoadingPromise;
}

async function loadTopoJSON() {
  const libraryAvailable = () => typeof topojson !== 'undefined' && typeof topojson.feature === 'function';
  if (libraryAvailable()) return;
  if (topojsonLoadingPromise) return topojsonLoadingPromise;

  topojsonLoadingPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (!libraryAvailable()) {
        console.warn('TopoJSON library not available after attempted load. Falling back to internal converter.');
      }
      resolve();
    };

    const existingScript = document.querySelector('script[data-lib="topojson-client"]');
    if (existingScript) {
      const loadState = existingScript.dataset.loadState;
      if (loadState === 'loaded') {
        finish();
        return;
      }
      if (loadState === 'failed') {
        existingScript.remove();
      } else {
        existingScript.addEventListener('load', () => {
          existingScript.dataset.loadState = 'loaded';
          finish();
        }, { once: true });
        existingScript.addEventListener('error', () => {
          existingScript.dataset.loadState = 'failed';
          existingScript.remove();
          finish();
        }, { once: true });
        return;
      }
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/topojson-client/3.1.0/topojson-client.min.js';
    script.async = true;
    script.dataset.lib = 'topojson-client';
    script.dataset.loadState = 'loading';
    script.onload = () => {
      script.dataset.loadState = 'loaded';
      finish();
    };
    script.onerror = () => {
      script.dataset.loadState = 'failed';
      script.remove();
      finish();
    };
    document.head.appendChild(script);
  }).finally(() => {
    topojsonLoadingPromise = null;
  });

  return topojsonLoadingPromise;
}

async function loadWorldData() {
  try {
    const response = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    if (!response.ok) throw new Error('Failed to load world data');
    return await response.json();
  } catch (error) {
    console.warn('Failed to load external world data:', error);
    return getSimplifiedWorldData();
  }
}

function getSimplifiedWorldData() {
  const createRectFeature = (iso, name, minLon, minLat, maxLon, maxLat) => ({
    type: 'Feature',
    properties: { ISO_A3: iso, NAME: name },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]
      ]]
    }
  });

  const features = [
    createRectFeature('USA', 'United States', -125, 24, -66, 49),
    createRectFeature('CHN', 'China', 73, 18, 135, 53),
    createRectFeature('DEU', 'Germany', 5, 47, 15, 55),
    createRectFeature('GBR', 'United Kingdom', -8, 49, 2, 59),
    createRectFeature('FRA', 'France', -5, 43, 7, 51),
    createRectFeature('IND', 'India', 68, 7, 89, 35),
    createRectFeature('BRA', 'Brazil', -74, -35, -34, 6),
    createRectFeature('JPN', 'Japan', 130, 30, 146, 46)
  ];

  return { type: 'FeatureCollection', features };
}

function extractWorldFeatures(worldData) {
  if (!worldData) return [];
  if (worldData.type === 'FeatureCollection' && Array.isArray(worldData.features)) {
    return worldData.features;
  }
  if (worldData.type === 'Topology' && worldData.objects?.countries) {
    const features = topologyToFeatures(worldData, 'countries');
    return Array.isArray(features) ? features : [];
  }
  return [];
}

function topologyToFeatures(topology, objectName) {
  try {
    const object = topology.objects?.[objectName];
    if (!object) return [];

    if (typeof topojson !== 'undefined' && typeof topojson.feature === 'function') {
      const collection = topojson.feature(topology, object);
      if (collection?.type === 'FeatureCollection' && Array.isArray(collection.features)) {
        return collection.features;
      }
      if (collection?.type === 'Feature') {
        return [collection];
      }
    }

    const fallbackCollection = convertTopologyToFeatureCollection(topology, object);
    if (fallbackCollection?.type === 'FeatureCollection' && Array.isArray(fallbackCollection.features)) {
      return fallbackCollection.features;
    }
    return [];
  } catch (error) {
    console.warn('Failed to convert topology to features:', error);
    return [];
  }
}

function convertTopologyToFeatureCollection(topology, object) {
  if (!topology || !object) {
    return { type: 'FeatureCollection', features: [] };
  }

  const transform = topology.transform || null;
  const hasTransform = transform && Array.isArray(transform.scale) && Array.isArray(transform.translate);
  const scale = hasTransform ? transform.scale : [1, 1];
  const translate = hasTransform ? transform.translate : [0, 0];

  const absoluteArcs = Array.isArray(topology.arcs) ? topology.arcs.map(arc => {
    let x = 0;
    let y = 0;
    const points = [];

    arc.forEach(point => {
      if (!Array.isArray(point) || point.length < 2) return;
      x += point[0];
      y += point[1];
      const transformed = hasTransform
        ? [translate[0] + x * scale[0], translate[1] + y * scale[1]]
        : [x, y];
      points.push(transformed);
    });

    return points;
  }) : [];

  const getArc = (index) => {
    const arcIndex = index >= 0 ? index : ~index;
    const arc = absoluteArcs[arcIndex] || [];
    const coordinates = arc.map(coord => coord.slice());
    if (index >= 0) {
      return coordinates;
    }
    return coordinates.reverse();
  };

  const mergeArcs = (arcIndexes = []) => {
    const coordinates = [];

    arcIndexes.forEach((arcIndex, position) => {
      const arcCoordinates = getArc(arcIndex);
      if (!arcCoordinates.length) return;

      if (position > 0 && coordinates.length) {
        const [lastX, lastY] = coordinates[coordinates.length - 1];
        const [nextX, nextY] = arcCoordinates[0] || [];
        const startIndex = (lastX === nextX && lastY === nextY) ? 1 : 0;
        for (let i = startIndex; i < arcCoordinates.length; i++) {
          coordinates.push(arcCoordinates[i]);
        }
      } else {
        coordinates.push(...arcCoordinates);
      }
    });

    return coordinates;
  };

  const transformPoint = (point = []) => {
    if (!Array.isArray(point)) return point;
    const [x = 0, y = 0] = point;
    if (!hasTransform) {
      return [x, y];
    }
    return [translate[0] + x * scale[0], translate[1] + y * scale[1]];
  };

  const convertGeometry = (geometry) => {
    if (!geometry) return null;

    switch (geometry.type) {
      case 'GeometryCollection': {
        const geometries = (geometry.geometries || [])
          .map(convertGeometry)
          .filter(Boolean);
        return geometries.length ? { type: 'GeometryCollection', geometries } : null;
      }
      case 'Point':
        return { type: 'Point', coordinates: transformPoint(geometry.coordinates) };
      case 'MultiPoint':
        return { type: 'MultiPoint', coordinates: (geometry.coordinates || []).map(transformPoint) };
      case 'LineString':
        return { type: 'LineString', coordinates: mergeArcs(geometry.arcs || []) };
      case 'MultiLineString':
        return { type: 'MultiLineString', coordinates: (geometry.arcs || []).map(mergeArcs) };
      case 'Polygon':
        return { type: 'Polygon', coordinates: (geometry.arcs || []).map(mergeArcs) };
      case 'MultiPolygon':
        return {
          type: 'MultiPolygon',
          coordinates: (geometry.arcs || []).map(rings => (rings || []).map(mergeArcs))
        };
      default:
        return null;
    }
  };

  const toFeatureArray = (obj) => {
    if (!obj) return [];

    if (obj.type === 'FeatureCollection') {
      return (obj.features || []).flatMap(toFeatureArray);
    }

    if (obj.type === 'Feature') {
      const geometry = convertGeometry(obj.geometry);
      if (!geometry) return [];
      return [{
        type: 'Feature',
        id: obj.id ?? obj.properties?.id ?? obj.properties?.ISO_A3 ?? undefined,
        properties: obj.properties ? { ...obj.properties } : {},
        geometry
      }];
    }

    if (obj.type === 'GeometryCollection') {
      return (obj.geometries || []).flatMap(geometry => {
        const converted = convertGeometry(geometry);
        if (!converted) return [];
        return [{
          type: 'Feature',
          id: geometry.id ?? geometry.properties?.id ?? geometry.properties?.ISO_A3 ?? undefined,
          properties: geometry.properties ? { ...geometry.properties } : {},
          geometry: converted
        }];
      });
    }

    const geometry = convertGeometry(obj);
    if (!geometry) return [];
    return [{
      type: 'Feature',
      id: obj.id ?? obj.properties?.id ?? obj.properties?.ISO_A3 ?? undefined,
      properties: obj.properties ? { ...obj.properties } : {},
      geometry
    }];
  };

  const features = toFeatureArray(object);
  return { type: 'FeatureCollection', features };
}

function getResponsiveDimensions(wrapper, defaultWidth, defaultHeight) {
  const MIN_WIDTH = 320;
  const MIN_HEIGHT = 280;

  const fallbackWidth = Math.max(defaultWidth || 960, MIN_WIDTH);
  const fallbackHeight = Math.max(defaultHeight || 500, MIN_HEIGHT);

  const rect = wrapper && typeof wrapper.getBoundingClientRect === 'function'
    ? wrapper.getBoundingClientRect()
    : null;
  const availableWidth = rect && rect.width
    ? rect.width
    : (wrapper?.clientWidth || wrapper?.offsetWidth || 0);

  const measuredWidth = availableWidth > 0
    ? availableWidth
    : (typeof window !== 'undefined' ? window.innerWidth - 40 : fallbackWidth);

  const width = Math.max(
    Math.min(fallbackWidth, measuredWidth || fallbackWidth),
    MIN_WIDTH
  );

  const aspectRatio = fallbackHeight / fallbackWidth;
  const responsiveHeight = Math.round(width * aspectRatio);
  const height = Math.max(
    Math.min(fallbackHeight, responsiveHeight),
    MIN_HEIGHT
  );

  return { width, height };
}

function getCountryId(countryData) {
  if (!countryData) return null;

  const properties = countryData.properties || {};
  const isoCandidates = [
    properties.ISO_A3,
    properties.iso_a3,
    properties.ADM0_A3,
    properties.adm0_a3,
    properties.A3_UN,
    properties.a3_un,
    properties.ABBREV,
    properties.abbrev
  ];

  for (const candidate of isoCandidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === '-99') continue;
    if (/^[A-Z]{3}$/i.test(trimmed)) {
      return trimmed.toUpperCase();
    }
  }

  const id = countryData.id;
  if (typeof id === 'string') {
    const trimmed = id.trim();
    if (/^[A-Z]{3}$/i.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    if (/^\d+$/.test(trimmed)) {
      return null;
    }
  }

  if (typeof id === 'number') {
    return null;
  }

  return typeof id === 'string' ? id.toUpperCase() : null;
}

function normalizeCountryName(name) {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getFeatureNameCandidates(feature) {
  const properties = feature?.properties || {};
  const names = [properties.NAME, properties.name, properties.NAME_LONG];
  return Array.from(new Set(names.filter(Boolean)));
}

function buildCountryNameLookup(metadataMap) {
  const lookup = new Map();
  metadataMap.forEach((country, iso) => {
    const normalizedName = normalizeCountryName(country?.name);
    if (normalizedName) lookup.set(normalizedName, iso);
  });
  return lookup;
}

function resolveCountryCodeFromName(feature, metadataMap, nameLookup = new Map()) {
  const candidates = getFeatureNameCandidates(feature);
  for (const candidate of candidates) {
    const normalized = normalizeCountryName(candidate);
    if (!normalized) continue;
    const directMatch = nameLookup.get(normalized);
    if (directMatch) return directMatch;
  }
  return null;
}

function getFeatureIsoCode(feature, metadataMap, nameLookup) {
  if (!feature) return null;
  const directId = getCountryId(feature);
  if (directId) return directId;
  return resolveCountryCodeFromName(feature, metadataMap, nameLookup);
}

function createManagedRiskDisplay(selectedCountries, managedRisk, managedRisksByCountry = null, fallbackRisks = {}) {
  const managedRiskDisplay = {};
  selectedCountries.forEach(countryCode => {
    if (managedRisksByCountry && Number.isFinite(managedRisksByCountry[countryCode])) {
      managedRiskDisplay[countryCode] = managedRisksByCountry[countryCode];
      return;
    }

    if (Number.isFinite(managedRisk)) {
      managedRiskDisplay[countryCode] = managedRisk;
      return;
    }

    if (fallbackRisks && Number.isFinite(fallbackRisks[countryCode])) {
      managedRiskDisplay[countryCode] = fallbackRisks[countryCode];
    }
  });
  return managedRiskDisplay;
}

function addZoomControls(svg, zoom) {
  const zoomControls = svg.append('g')
    .attr('class', 'zoom-controls')
    .attr('transform', 'translate(20, 20)');

  zoomControls.append('rect')
    .attr('x', 0).attr('y', 0).attr('width', 30).attr('height', 30)
    .attr('fill', 'white').attr('stroke', '#374151').attr('stroke-width', 1).attr('rx', 4)
    .style('cursor', 'pointer')
    .on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1.5));

  zoomControls.append('text')
    .attr('x', 15).attr('y', 20).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .style('font-size', '18px').style('font-weight', 'bold').style('fill', '#374151')
    .style('pointer-events', 'none').text('+');

  zoomControls.append('rect')
    .attr('x', 0).attr('y', 35).attr('width', 30).attr('height', 30)
    .attr('fill', 'white').attr('stroke', '#374151').attr('stroke-width', 1).attr('rx', 4)
    .style('cursor', 'pointer')
    .on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 0.67));

  zoomControls.append('text')
    .attr('x', 15).attr('y', 55).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .style('font-size', '20px').style('font-weight', 'bold').style('fill', '#374151')
    .style('pointer-events', 'none').text('−');

  zoomControls.append('rect')
    .attr('x', 0).attr('y', 70).attr('width', 30).attr('height', 30)
    .attr('fill', 'white').attr('stroke', '#374151').attr('stroke-width', 1).attr('rx', 4)
    .style('cursor', 'pointer')
    .on('click', () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));

  zoomControls.append('text')
    .attr('x', 15).attr('y', 90).attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .style('font-size', '10px').style('font-weight', 'bold').style('fill', '#374151')
    .style('pointer-events', 'none').text('⌂');
}

function disableMouseWheelZoom(svg) {
  if (!svg || typeof svg.on !== 'function') return;
  svg
    .on('wheel.zoom', null)
    .on('mousewheel.zoom', null)
    .on('DOMMouseScroll.zoom', null);
}

function showMapTooltip(event, countryData, countryRisks, countryMetadata = new Map(), nameLookup = new Map(), mapType = 'baseline') {
  const countryId = countryData.__isoCode;
  const countryName = countryMetadata.get(countryId)?.name || countryData.properties?.NAME || countryId || 'Unknown';
  const risk = countryId ? countryRisks[countryId] : undefined;

  d3.selectAll('.map-tooltip').remove();

  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'map-tooltip')
    .style('position', 'absolute')
    .style('background', 'rgba(0, 0, 0, 0.8)')
    .style('color', 'white')
    .style('padding', '8px')
    .style('border-radius', '4px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('opacity', 0);

  tooltip.transition().duration(200).style('opacity', 1);

  const pageX = event.pageX || 0;
  const pageY = event.pageY || 0;

  const riskLabel = mapType === 'managed' ? 'Managed Risk (Coverage-Based)' :
                    mapType === 'global' ? 'Global Risk' : 'Baseline Risk';

  tooltip.html(`
    <strong>${countryName}</strong><br/>
    ${risk !== undefined ?
      `${riskLabel}: ${risk.toFixed(1)}<br/>Risk Band: ${riskEngine.getRiskBand(risk)}` :
      'No data available'}
  `)
  .style('left', (pageX + 10) + 'px')
  .style('top', (pageY - 10) + 'px');
}

// ENHANCED: Show detailed tooltip with focus effects for comparison maps
function showComparisonMapTooltip(event, countryData, countryRisks, countryMetadata = new Map(), nameLookup = new Map(), mapType = 'baseline', options = {}) {
  const countryId = countryData.__isoCode;
  const countryName = countryMetadata.get(countryId)?.name || countryData.properties?.NAME || countryId || 'Unknown';
  const { 
    highlight = false, 
    fallbackRisks = null, 
    baselineRisks = null, 
    focus = 0,
    focusEffectivenessMetrics = null 
  } = options;

  let risk = countryId ? countryRisks?.[countryId] : undefined;
  if (!Number.isFinite(risk) && fallbackRisks && countryId) {
    const fallbackRisk = fallbackRisks[countryId];
    if (Number.isFinite(fallbackRisk)) {
      risk = fallbackRisk;
    }
  }

  // ENHANCED: Calculate focus benefits for this country
  let focusBenefitInfo = '';
  if (mapType === 'managed' && baselineRisks && countryId && Number.isFinite(focus)) {
    const baselineRisk = baselineRisks[countryId];
    if (Number.isFinite(baselineRisk) && Number.isFinite(risk)) {
      const riskReduction = baselineRisk - risk;
      const reductionPercentage = baselineRisk > 0 ? (riskReduction / baselineRisk) * 100 : 0;
      
      // Determine focus benefit level
      const baselinePortfolioRisk = focusEffectivenessMetrics?.riskData?.reduce((sum, d) => sum + d.baselineRisk, 0) / 
                                   (focusEffectivenessMetrics?.riskData?.length || 1) || baselineRisk;
      const focusBenefitLevel = riskEngine.getFocusBenefitLevel(baselineRisk, baselinePortfolioRisk, focus);
      
      const benefitDescriptions = {
        'high': 'High priority - receives enhanced coverage',
        'medium': 'Medium priority - receives moderate boost',
        'standard': 'Standard coverage allocation',
        'reduced': 'Lower priority - reduced coverage allocation'
      };
      
      focusBenefitInfo = `
        <div style="border-top: 1px solid #444; margin: 6px 0; padding-top: 6px;">
          <div style="color: ${riskReduction > 0 ? '#22c55e' : '#ef4444'};">
            <strong>Risk Reduction:</strong> ${riskReduction.toFixed(1)} pts (${reductionPercentage.toFixed(1)}%)
          </div>
          <div style="font-size: 11px; color: #ccc; margin-top: 4px;">
            <strong>Focus Impact:</strong> ${benefitDescriptions[focusBenefitLevel] || 'Standard coverage'}
          </div>
        </div>
      `;
    }
  }

  d3.selectAll('.map-tooltip').remove();

  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'map-tooltip')
    .style('position', 'absolute')
    .style('background', 'rgba(0, 0, 0, 0.9)')
    .style('color', 'white')
    .style('padding', '12px')
    .style('border-radius', '8px')
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('opacity', 0);

  tooltip.transition().duration(200).style('opacity', 1);

  const pageX = event.pageX || 0;
  const pageY = event.pageY || 0;
  const riskLabel = mapType === 'managed' ? 'Managed Risk (Coverage-Based)' : 'Baseline Risk';
  const highlightNote = highlight ? '<br/><em style="color: #3b82f6;">Selected Country</em>' : '';

  tooltip.html(`
    <strong>${countryName}</strong><br/>
    ${Number.isFinite(risk) ?
      `${riskLabel}: ${risk.toFixed(1)}<br/>Risk Band: ${riskEngine.getRiskBand(risk)}${highlightNote}${focusBenefitInfo}` :
      'No data available'}
  `)
  .style('left', (pageX + 10) + 'px')
  .style('top', (pageY - 10) + 'px');
}

function hideMapTooltip() {
  d3.selectAll('.map-tooltip').remove();
}

function createMapLegend(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  const title = document.createElement('h4');
  title.textContent = 'Risk Levels:';
  title.style.cssText = 'font-size: 14px; font-weight: 500; margin-bottom: 8px;';
  container.appendChild(title);

  const legendContainer = document.createElement('div');
  legendContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;';

  riskEngine.getRiskBandDefinitions().forEach(band => {
    const legendItem = document.createElement('div');
    legendItem.style.cssText = 'display: flex; align-items: center; gap: 4px;';
    legendItem.innerHTML = `
      <div style="width: 16px; height: 16px; border: 1px solid #ccc; background-color: ${band.color};"></div>
      <span style="font-size: 12px;">${band.name} (${band.range})</span>
    `;
    legendContainer.appendChild(legendItem);
  });

  container.appendChild(legendContainer);
}

function createSimpleMapGrid(containerId, { countries, countryRisks, selectedCountries = [], onCountrySelect, title, interactive = true, mapType = 'baseline' }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const displayCountries = interactive ?
    countries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20) :
    countries.filter(country => selectedCountries.includes(country.isoCode));

  container.innerHTML = `
    <div class="simple-map-container" style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); text-align: center;">
      ${title ? `<h3 style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">${title}</h3>` : ''}
      <div class="map-grid" id="simpleMapGrid-${mapType}" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 20px 0;">
      </div>
      ${displayCountries.length === 0 ? `
        <div style="padding: 40px; color: #6b7280; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🌍</div>
          <p>No countries to display</p>
        </div>
      ` : ''}
    </div>
  `;

  const mapGrid = document.getElementById(`simpleMapGrid-${mapType}`);
  if (!mapGrid || displayCountries.length === 0) return;

  displayCountries.forEach(country => {
    const risk = countryRisks[country.isoCode] || 0;
    const isSelected = selectedCountries.includes(country.isoCode);
    const numericRisk = Number.isFinite(risk) ? risk : Number.isFinite(Number(risk)) ? Number(risk) : 0;
    const tileOpacity = mapType === 'global' ? 1 : (numericRisk > 0 ? 0.9 : 0.4);

    const countryTile = document.createElement('div');
    countryTile.style.cssText = `
      padding: 12px 8px; border-radius: 4px; border: 2px solid ${isSelected ? '#000' : '#e5e7eb'};
      cursor: ${interactive ? 'pointer' : 'default'}; font-size: 11px; font-weight: 500; color: white; text-align: center;
      background-color: ${riskEngine.getRiskColor(numericRisk)}; opacity: ${tileOpacity};
      min-height: 60px; display: flex; flex-direction: column; justify-content: center;
    `;

    countryTile.innerHTML = `<div>${country.name.length > 12 ? country.isoCode : country.name}</div>`;

    if (interactive && onCountrySelect) {
      countryTile.addEventListener('click', () => {
        onCountrySelect(country.isoCode);
      });
    }

    mapGrid.appendChild(countryTile);
  });
}

function createFallbackMap(containerId, { countries, countryRisks, selectedCountries, onCountrySelect, title, interactive = true, mapType = 'baseline' }) {
  createSimpleMapGrid(containerId, { countries, countryRisks, selectedCountries, onCountrySelect, title, interactive, mapType });
}

function createFallbackComparisonMap(containerId, { countries, countryRisks, selectedCountries, title, mapType }) {
  createSimpleMapGrid(containerId, { countries, countryRisks, selectedCountries, title, interactive: false, mapType });
}

function renderGlobalD3Map(worldData, { container, countries, countryRisks, width, height }) {
  const wrapper = document.getElementById(container);
  if (!wrapper) return;
  wrapper.innerHTML = '';

  try {
    const features = extractWorldFeatures(worldData);
    if (!features.length) throw new Error('No geographic features available');

    const featureCollection = { type: 'FeatureCollection', features };
    const { width: responsiveWidth, height: responsiveHeight } = getResponsiveDimensions(wrapper, width, height);
    const svg = d3.select(wrapper)
      .append('svg')
      .attr('viewBox', `0 0 ${responsiveWidth} ${responsiveHeight}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')
      .style('border', '1px solid #e5e7eb')
      .style('border-radius', '8px')
      .style('background', '#f8fafc');

    const projection = d3.geoNaturalEarth1()
      .fitExtent([[16, 16], [responsiveWidth - 16, responsiveHeight - 16]], featureCollection);
    const path = d3.geoPath(projection);
    const mapGroup = svg.append('g').attr('class', 'map-layer');

    mapGroup.append('path')
      .datum({ type: 'Sphere' })
      .attr('d', path)
      .attr('fill', '#e0f2fe')
      .attr('stroke', '#bae6fd')
      .attr('stroke-width', 0.6)
      .attr('pointer-events', 'none');

    const metadataMap = new Map(countries.map(country => [country.isoCode, country]));
    const nameLookup = buildCountryNameLookup(metadataMap);

    features.forEach(feature => {
      feature.__isoCode = getFeatureIsoCode(feature, metadataMap, nameLookup);
    });

    const countryGroup = mapGroup.append('g').attr('class', 'countries');

    countryGroup.selectAll('path.country')
      .data(features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('data-iso-code', d => d.__isoCode || '')
      .attr('d', path)
      .style('cursor', 'default')
      .style('fill', d => {
        const countryId = d.__isoCode;
        const risk = countryRisks[countryId];
        const numericRisk = Number.isFinite(risk) ? risk : Number.isFinite(Number(risk)) ? Number(risk) : NaN;
        return riskEngine.getRiskColor(numericRisk);
      })
      .style('stroke', '#ffffff')
      .style('stroke-width', 0.6)
      .style('fill-opacity', 1)
      .style('opacity', 1)
      .on('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
      })
      .on('mouseover', (event, d) => showMapTooltip(event, d, countryRisks, metadataMap, nameLookup, 'global'))
      .on('mouseout', () => hideMapTooltip());

    const zoom = d3.zoom()
      .scaleExtent([0.5, 10])
      .on('zoom', (event) => {
        mapGroup.attr('transform', event.transform);
      });

   svg.call(zoom);
    disableMouseWheelZoom(svg);
    addZoomControls(svg, zoom);
  } catch (error) {
    console.warn('D3 global map rendering failed, using fallback:', error);
     createSimpleMapGrid(container, { countries, countryRisks, interactive: false, mapType: 'global' });
  }
}

// ENHANCED: Render comparison map with focus visualization
function renderComparisonD3Map(worldData, { container, countries, countryRisks, selectedCountryRisks, selectedCountries, width, height, mapType, baselineRisks = null, focus = 0, focusEffectivenessMetrics = null }) {
  const wrapper = document.getElementById(container);
  if (!wrapper) return;
  wrapper.innerHTML = '';

  try {
    const features = extractWorldFeatures(worldData);
    if (!features.length) throw new Error('No geographic features available');

    const metadataMap = new Map(countries.map(country => [country.isoCode, country]));
    const nameLookup = buildCountryNameLookup(metadataMap);

    features.forEach(feature => {
      feature.__isoCode = getFeatureIsoCode(feature, metadataMap, nameLookup);
    });

    const selectedSet = new Set(selectedCountries);
    const selectedFeatures = features.filter(feature =>
      feature.__isoCode && selectedSet.has(feature.__isoCode)
    );

    if (selectedFeatures.length === 0) {
      wrapper.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #6b7280;">
          <div style="font-size: 48px; margin-bottom: 16px;">🌍</div>
          <p>No selected countries to display</p>
        </div>
      `;
      return;
    }

    const featureCollection = { type: 'FeatureCollection', features };
    const { width: responsiveWidth, height: responsiveHeight } = getResponsiveDimensions(wrapper, width, height);
    const svg = d3.select(wrapper)
      .append('svg')
      .attr('viewBox', `0 0 ${responsiveWidth} ${responsiveHeight}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')
      .style('border', '1px solid #e5e7eb')
      .style('border-radius', '8px')
      .style('background', '#f8fafc');

    const projection = d3.geoNaturalEarth1()
      .fitExtent([[16, 16], [responsiveWidth - 16, responsiveHeight - 16]], featureCollection);
    const path = d3.geoPath(projection);
    const mapGroup = svg.append('g').attr('class', 'map-layer');

    mapGroup.append('path')
      .datum({ type: 'Sphere' })
      .attr('d', path)
      .attr('fill', '#e0f2fe')
      .attr('stroke', '#bae6fd')
      .attr('stroke-width', 0.6)
      .attr('pointer-events', 'none');

    const backgroundGroup = mapGroup.append('g').attr('class', 'background-countries');
    backgroundGroup.selectAll('path.background-country')
      .data(features)
      .enter()
      .append('path')
      .attr('class', 'background-country')
      .attr('data-iso-code', d => d.__isoCode || '')
      .attr('d', path)
      .style('cursor', 'default')
      .style('fill', d => {
        const countryId = d.__isoCode;
        const risk = Number.isFinite(countryRisks?.[countryId]) ? countryRisks[countryId] : null;
        return risk !== null ? riskEngine.getRiskColor(risk) : '#e2e8f0';
      })
      .style('stroke', '#e5e7eb')
      .style('stroke-width', 0.5)
      .style('opacity', d => selectedSet.has(d.__isoCode) ? 0.35 : 0.22)
      .style('pointer-events', d => selectedSet.has(d.__isoCode) ? 'none' : 'auto')
      .on('mouseover', (event, d) => showComparisonMapTooltip(event, d, countryRisks, metadataMap, nameLookup, 'baseline'))
      .on('mouseout', () => hideMapTooltip());

    const highlightRisks = (selectedCountryRisks && typeof selectedCountryRisks === 'object')
      ? selectedCountryRisks
      : {};

    const getSelectedRisk = (countryId) => {
      if (!countryId) return undefined;
      if (Number.isFinite(highlightRisks[countryId])) {
        return highlightRisks[countryId];
      }
      if (mapType === 'managed' && Number.isFinite(countryRisks?.[countryId])) {
        return countryRisks[countryId];
      }
      return undefined;
    };

    // ENHANCED: Add visual indicators based on focus benefit levels
    const countryGroup = mapGroup.append('g').attr('class', 'countries');

    countryGroup.selectAll('path.country')
      .data(selectedFeatures)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('data-iso-code', d => d.__isoCode || '')
      .attr('d', path)
      .style('cursor', 'default')
      .style('fill', d => {
        const countryId = d.__isoCode;
        const risk = getSelectedRisk(countryId);
        return Number.isFinite(risk) ? riskEngine.getRiskColor(risk) : '#e5e7eb';
      })
      .style('stroke', d => {
        // ENHANCED: Different stroke styles based on focus benefits
        const countryId = d.__isoCode;
        if (mapType === 'managed' && baselineRisks && Number.isFinite(focus) && focus > 0.3) {
          const baselineRisk = baselineRisks[countryId];
          const baselinePortfolioRisk = focusEffectivenessMetrics?.riskData?.reduce((sum, d) => sum + d.baselineRisk, 0) / 
                                       (focusEffectivenessMetrics?.riskData?.length || 1) || baselineRisk;
          const focusBenefitLevel = riskEngine.getFocusBenefitLevel(baselineRisk, baselinePortfolioRisk, focus);
          
          switch (focusBenefitLevel) {
            case 'high': return '#059669'; // Green for high benefit
            case 'medium': return '#3b82f6'; // Blue for medium benefit
            case 'reduced': return '#dc2626'; // Red for reduced allocation
            default: return '#111827'; // Default black
          }
        }
        return '#111827';
      })
      .style('stroke-width', d => {
        // ENHANCED: Thicker borders for high-benefit countries
        const countryId = d.__isoCode;
        if (mapType === 'managed' && baselineRisks && Number.isFinite(focus) && focus > 0.3) {
          const baselineRisk = baselineRisks[countryId];
          const baselinePortfolioRisk = focusEffectivenessMetrics?.riskData?.reduce((sum, d) => sum + d.baselineRisk, 0) / 
                                       (focusEffectivenessMetrics?.riskData?.length || 1) || baselineRisk;
          const focusBenefitLevel = riskEngine.getFocusBenefitLevel(baselineRisk, baselinePortfolioRisk, focus);
          return focusBenefitLevel === 'high' ? 2.5 : focusBenefitLevel === 'medium' ? 2.0 : 1.5;
        }
        return 1.5;
      })
      .style('opacity', d => {
        // ENHANCED: Slight opacity differences to show focus allocation
        const countryId = d.__isoCode;
        if (mapType === 'managed' && baselineRisks && Number.isFinite(focus) && focus > 0.5) {
          const baselineRisk = baselineRisks[countryId];
          const baselinePortfolioRisk = focusEffectivenessMetrics?.riskData?.reduce((sum, d) => sum + d.baselineRisk, 0) / 
                                       (focusEffectivenessMetrics?.riskData?.length || 1) || baselineRisk;
          const focusBenefitLevel = riskEngine.getFocusBenefitLevel(baselineRisk, baselinePortfolioRisk, focus);
          return focusBenefitLevel === 'high' ? 1.0 : focusBenefitLevel === 'reduced' ? 0.8 : 0.95;
        }
        return 0.95;
      })
      .on('mouseover', (event, d) => showComparisonMapTooltip(event, d, highlightRisks, metadataMap, nameLookup, mapType, {
        highlight: true,
        fallbackRisks: countryRisks,
        baselineRisks: baselineRisks,
        focus: focus,
        focusEffectivenessMetrics: focusEffectivenessMetrics
      }))
      .on('mouseout', () => hideMapTooltip());

    const zoom = d3.zoom()
      .scaleExtent([0.5, 10])
      .on('zoom', (event) => {
        mapGroup.attr('transform', event.transform);
      });

    svg.call(zoom);
    disableMouseWheelZoom(svg);
    addZoomControls(svg, zoom);
  } catch (error) {
    console.warn('D3 comparison map rendering failed, using fallback:', error);
    createSimpleMapGrid(container, { countries, countryRisks, selectedCountries, title: '', interactive: false, mapType });
  }
}

function renderD3Map(worldData, { container, countries, countryRisks, selectedCountries, onCountrySelect, width, height, mapType }) {
  const wrapper = document.getElementById(container);
  if (!wrapper) return;
  wrapper.innerHTML = '';

  try {
    const features = extractWorldFeatures(worldData);
    if (!features.length) throw new Error('No geographic features available');

   const featureCollection = { type: 'FeatureCollection', features };
    const { width: responsiveWidth, height: responsiveHeight } = getResponsiveDimensions(wrapper, width, height);
    const svg = d3.select(wrapper)
      .append('svg')
      .attr('viewBox', `0 0 ${responsiveWidth} ${responsiveHeight}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto')
      .style('border', '1px solid #e5e7eb')
      .style('border-radius', '8px')
      .style('background', '#f8fafc');

    const projection = d3.geoNaturalEarth1()
      .fitExtent([[16, 16], [responsiveWidth - 16, responsiveHeight - 16]], featureCollection);
    const path = d3.geoPath(projection);
    const mapGroup = svg.append('g').attr('class', 'map-layer');

     mapGroup.append('path')
      .datum({ type: 'Sphere' })
      .attr('d', path)
      .attr('fill', '#e0f2fe')
      .attr('stroke', '#bae6fd')
      .attr('stroke-width', 0.6)
      .attr('pointer-events', 'none');

    const safeCountryRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};
    const safeSelectedCountries = Array.isArray(selectedCountries) ? selectedCountries : [];
    const selectedSet = new Set(safeSelectedCountries);
    const hasSelections = selectedSet.size > 0;

    const metadataMap = new Map(countries.map(country => [country.isoCode, country]));
    const nameLookup = buildCountryNameLookup(metadataMap);

    features.forEach(feature => {
      feature.__isoCode = getFeatureIsoCode(feature, metadataMap, nameLookup);
    });

    const countryGroup = mapGroup.append('g').attr('class', 'countries');

     countryGroup.selectAll('path.country')
      .data(features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('data-iso-code', d => d.__isoCode || '')
      .attr('d', path)
      .style('cursor', 'pointer')
      .style('fill', d => {
        const countryId = d.__isoCode;
        const risk = safeCountryRisks[countryId];
        return risk !== undefined ? riskEngine.getRiskColor(risk) : '#e5e7eb';
      })
      .style('fill-opacity', d => {
        const countryId = d.__isoCode;
        const risk = safeCountryRisks[countryId];
        if (risk === undefined) {
          return hasSelections ? 0.25 : 0.6;
        }
        if (!hasSelections) {
          return 0.95;
        }
        return selectedSet.has(countryId) ? 0.95 : 0.22;
      })
      .style('stroke', d => {
        const countryId = d.__isoCode;
        if (!countryId) return '#ffffff';
        if (selectedSet.has(countryId)) return '#111827';
        return hasSelections ? '#cbd5f5' : '#ffffff';
      })
      .style('stroke-width', d => {
        const countryId = d.__isoCode;
        if (selectedSet.has(countryId)) return 1.6;
        return hasSelections ? 0.8 : 0.6;
      })
      .style('stroke-opacity', d => {
        if (!hasSelections) return 1;
        return selectedSet.has(d.__isoCode) ? 1 : 0.5;
      })
      .style('filter', d => (hasSelections && selectedSet.has(d.__isoCode)
        ? 'drop-shadow(0 0 6px rgba(15, 23, 42, 0.35))'
        : 'none'))
      .on('click', (event, d) => {
        const countryId = d.__isoCode;
        if (!countryId) return;
        if (onCountrySelect) onCountrySelect(countryId);
      })
      .on('mouseover', (event, d) => showMapTooltip(event, d, safeCountryRisks, metadataMap, nameLookup, mapType))
      .on('mouseout', () => hideMapTooltip());

    const zoom = d3.zoom()
      .scaleExtent([0.5, 10])
      .on('zoom', (event) => {
        mapGroup.attr('transform', event.transform);
      });

     svg.call(zoom);
    disableMouseWheelZoom(svg);
    addZoomControls(svg, zoom);
  } catch (error) {
    console.warn('D3 map rendering failed, using fallback:', error);
    createSimpleMapGrid(container, {
      countries,
      countryRisks: safeCountryRisks,
      selectedCountries: safeSelectedCountries,
      onCountrySelect
    });
  }
}

export async function createGlobalRiskMap(containerId, { countries, countryRisks, title, height = 500, width = 960 }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="global-risk-map-container" style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); text-align: center;">
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">${title}</h3>
      <div id="map-loading" style="padding: 40px; color: #6b7280;">
        <div>Loading global coverage-based risk map...</div>
        <div style="font-size: 14px; margin-top: 8px;">Hover over countries to see their baseline risk levels before HRDD strategy application.</div>
      </div>
      <div id="map-wrapper" style="width: 100%; display: flex; justify-content: center; margin-bottom: 16px;">
      </div>
      <div class="risk-legend" id="mapLegend" style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;">
      </div>
    </div>
  `;

  const safeCountryRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};

  try {
    await loadD3();
    const worldData = await loadWorldData();

    if (worldData?.type === 'Topology') {
      try {
        await loadTopoJSON();
      } catch (topojsonError) {
        console.warn('TopoJSON library unavailable - using internal converter instead.', topojsonError);
      }
    }

    renderGlobalD3Map(worldData, {
      container: 'map-wrapper',
      countries,
      countryRisks: safeCountryRisks,
      width,
      height: Math.max(height, 400)
    });

    createMapLegend('mapLegend');

    const loadingElement = document.getElementById('map-loading');
    if (loadingElement) loadingElement.remove();
  } catch (error) {
    console.error('Error creating global risk map:', error);
    createFallbackMap(containerId, {
      countries,
      countryRisks: safeCountryRisks,
      title,
      interactive: false,
      mapType: 'global'
    });
  }
}

// ENHANCED: Create comparison map with focus visualization
export async function createComparisonMap(containerId, { countries, countryRisks, selectedCountries, title, mapType = 'baseline', managedRisk = null, baselineRisk = null, selectedCountryRisks = null, height = 400, width = 960, baselineRisks = null, focus = 0, focusEffectivenessMetrics = null }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const formatOverallRisk = (value) => Number.isFinite(value) ? value.toFixed(1) : 'N/A';
  
  // ENHANCED: Show focus information in title for managed risk maps
  let displayTitle = mapType === 'managed'
    ? `${title} - Overall Risk: ${formatOverallRisk(managedRisk)}`
    : mapType === 'baseline'
      ? `${title} - Overall Risk: ${formatOverallRisk(baselineRisk)}`
      : title;

  if (mapType === 'managed' && Number.isFinite(focus) && focus > 0.3) {
    const focusPercent = Math.round(focus * 100);
    displayTitle += ` (${focusPercent}% focus)`;
  }

  container.innerHTML = `
    <div class="comparison-map-container" style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); text-align: center;">
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">${displayTitle}</h3>
      <div id="comp-map-loading-${mapType}" style="padding: 30px; color: #6b7280;">
        <div>Loading comparison map...</div>
        <div style="font-size: 14px; margin-top: 8px;">Showing selected countries only for comparison.</div>
      </div>
      <div id="comp-map-wrapper-${mapType}" style="width: 100%; display: flex; justify-content: center; margin-bottom: 16px;">
      </div>
      <div class="risk-legend" id="compMapLegend-${mapType}" style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;">
      </div>
      
      ${mapType === 'managed' && Number.isFinite(focus) && focus > 0.3 ? `
        <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; padding: 12px; border-radius: 6px; margin-top: 16px; font-size: 13px;">
          <strong>Focus Visualization:</strong> 
          <span style="color: #059669;">Green borders</span> = High priority countries (enhanced coverage), 
          <span style="color: #3b82f6;">Blue borders</span> = Medium priority, 
          <span style="color: #dc2626;">Red borders</span> = Lower priority
        </div>
      ` : ''}
    </div>
  `;

  const safeSelectedCountries = Array.isArray(selectedCountries) ? selectedCountries : [];
  const safeCountryRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};

  let highlightRisks = {};

  const selectedCountriesData = countries.filter(country =>
    safeSelectedCountries.includes(country.isoCode)
  );

  if (selectedCountriesData.length === 0) {
    const loadingElement = document.getElementById(`comp-map-loading-${mapType}`);
    if (loadingElement) {
      loadingElement.innerHTML = `
        <div style="padding: 20px; color: #6b7280; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🏭</div>
          <p>No countries selected for comparison</p>
          <p style="font-size: 14px; margin-top: 8px;">Select countries in Panel 2 to see the comparison maps.</p>
        </div>
      `;
    }
    return;
  }

  try {
    await loadD3();
    const worldData = await loadWorldData();

    if (worldData?.type === 'Topology') {
      try {
        await loadTopoJSON();
      } catch (topojsonError) {
        console.warn('TopoJSON library unavailable - using internal converter instead.', topojsonError);
      }
    }

    const safeSelectedRiskMap = (selectedCountryRisks && typeof selectedCountryRisks === 'object')
      ? selectedCountryRisks
      : null;

    highlightRisks = (() => {
      if (mapType === 'managed') {
        return createManagedRiskDisplay(
          safeSelectedCountries,
          managedRisk,
          safeSelectedRiskMap,
          safeCountryRisks
        );
      }

      if (safeSelectedRiskMap) {
        return createManagedRiskDisplay(
          safeSelectedCountries,
          null,
          safeSelectedRiskMap,
          safeCountryRisks
        );
      }

      const baselineHighlight = {};
      safeSelectedCountries.forEach(countryCode => {
        if (Number.isFinite(safeCountryRisks[countryCode])) {
          baselineHighlight[countryCode] = safeCountryRisks[countryCode];
        }
      });
      return baselineHighlight;
    })();

    // ENHANCED: Pass additional parameters for focus visualization
    renderComparisonD3Map(worldData, {
      container: `comp-map-wrapper-${mapType}`,
      countries,
      countryRisks: safeCountryRisks,
      selectedCountryRisks: highlightRisks,
      selectedCountries: safeSelectedCountries,
      width,
      height: Math.max(height, 300),
      mapType,
      baselineRisks: baselineRisks,
      focus: focus,
      focusEffectivenessMetrics: focusEffectivenessMetrics
    });

    createMapLegend(`compMapLegend-${mapType}`);

    const loadingElement = document.getElementById(`comp-map-loading-${mapType}`);
    if (loadingElement) loadingElement.remove();
   } catch (error) {
    console.error('Error creating comparison map:', error);
    createFallbackComparisonMap(containerId, {
      countries: selectedCountriesData,
      countryRisks: Object.keys(highlightRisks).length > 0 ? highlightRisks : safeCountryRisks,
      selectedCountries: safeSelectedCountries,
      title: displayTitle,
      mapType
    });
  }
}

export async function createWorldMap(containerId, { countries, countryRisks, selectedCountries, onCountrySelect, title, subtitle = null, mapType = 'baseline', managedRisk = null, height = 500, width = 960 }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const displayTitle = mapType === 'managed' ?
  `${title} - Managed Risk (Coverage-Based): ${managedRisk ? managedRisk.toFixed(1) : 'N/A'}` :
  title;
  const titleMarginBottom = subtitle ? '8px' : '16px';
  const subtitleHtml = subtitle ? `<div style="font-size: 14px; color: #4b5563; margin-bottom: 16px;">${subtitle}</div>` : '';

  container.innerHTML = `
    <div class="world-map-container" style="background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); text-align: center;">
      <h3 style="font-size: 18px; font-weight: 600; margin-bottom: ${titleMarginBottom};">${displayTitle}</h3>
      ${subtitleHtml}
      <div id="map-loading" style="padding: 40px; color: #6b7280;">
        <div>Loading interactive coverage-based risk map...</div>
        <div style="font-size: 14px; margin-top: 8px;">Click on countries to select them for your portfolio risk assessment.</div>
      </div>
      <div id="map-wrapper" style="width: 100%; display: flex; justify-content: center; margin-bottom: 16px;">
      </div>
      <div class="risk-legend" id="mapLegend" style="display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;">
      </div>
    </div>
  `;

  const safeSelectedCountries = Array.isArray(selectedCountries) ? selectedCountries : [];
  const safeCountryRisks = (countryRisks && typeof countryRisks === 'object') ? countryRisks : {};

  try {
    await loadD3();
    const worldData = await loadWorldData();

    if (worldData?.type === 'Topology') {
      try {
        await loadTopoJSON();
      } catch (topojsonError) {
        console.warn('TopoJSON library unavailable - using internal converter instead.', topojsonError);
      }
    }

    const displayRisks = mapType === 'managed' && managedRisk !== null ?
      createManagedRiskDisplay(safeSelectedCountries, managedRisk) :
      safeCountryRisks;

    renderD3Map(worldData, {
      container: 'map-wrapper',
      countries,
      countryRisks: displayRisks,
      selectedCountries: safeSelectedCountries,
      onCountrySelect,
      width,
      height: Math.max(height, 600),
      mapType
    });

    createMapLegend('mapLegend');

    const loadingElement = document.getElementById('map-loading');
    if (loadingElement) loadingElement.remove();
   } catch (error) {
    console.error('Error creating world map:', error);
    createFallbackMap(containerId, {
      countries,
      countryRisks: safeCountryRisks,
      selectedCountries: safeSelectedCountries,
      onCountrySelect,
      title: displayTitle,
      mapType
    });
  }
}