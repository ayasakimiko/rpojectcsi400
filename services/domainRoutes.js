import express from "express";

const ROUTES = {
  customer: {
    maintenance: ["/maintenance", "/maintenance/:id/cancel"],
    payment: ["/payment-channels", "/payments/confirm"],
  },
  staff: {
    maintenance: ["/maintenance/history", "/maintenance/:id/:action"],
    payment: ["/payment-slips", "/payment-verifications", "/payment-verifications/:id", "/rooms/:room_number/collect-payment", "/rooms/:room_number/utility-bill"],
  },
  admin: {
    maintenance: ["/rooms/:room_number/maintenance", "/logs/maintenance"],
  },
  owner: {
    payment: ["/income", "/income/items", "/income/items/:id", "/utility-receipts", "/logs/payments"],
  },
};

function selectedPaths(role, domain) {
  return new Set(ROUTES[role]?.[domain] || []);
}

function copyRouterLayers(router, predicate, { includeNested = false } = {}) {
  const result = express.Router();
  // Keep the original auth middleware and route handlers in their defined order.
  result.stack = router.stack.filter((layer) => layer.route ? predicate(layer.route.path) : includeNested || layer.name !== "router");
  return result;
}

export function domainRouter(router, role, domain) {
  const paths = selectedPaths(role, domain);
  if (paths.size === 0) throw new Error(`No ${domain} routes configured for ${role}`);
  const found = new Set(router.stack.filter((layer) => paths.has(layer.route?.path)).map((layer) => layer.route.path));
  for (const path of paths) if (!found.has(path)) throw new Error(`Missing ${role} route: ${path}`);
  return copyRouterLayers(router, (path) => paths.has(path));
}

export function withoutDomainRoutes(router, role) {
  const paths = new Set(Object.values(ROUTES[role] || {}).flat());
  return copyRouterLayers(router, (path) => !paths.has(path), { includeNested: true });
}
