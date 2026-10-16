// Walks the cleaned services tree (what /api/services serves the browser) for the first widget
// of a type. Nested groups sit under `groups`; the cleaned service keeps its widgets in `widgets`.
export function findWidgetByType(groups, type) {
  for (const group of groups ?? []) {
    for (const service of group?.services ?? []) {
      const widgets = service?.widgets ?? (service?.widget ? [service.widget] : []);
      const found = widgets.find((widget) => widget?.type === type);
      if (found) return found;
    }
    const nested = findWidgetByType(group?.groups, type);
    if (nested) return nested;
  }
  return null;
}
