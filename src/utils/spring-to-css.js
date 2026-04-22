// Converts spring physics configs (stiffness, damping, mass) to a
// CSS linear() easing approximation. Used when Framer Motion or GSAP
// spring configs are detected and we need a CSS fallback.

export function springToCss(config = {}) {
  const {
    stiffness = 100,
    damping = 10,
    mass = 1,
    steps = 20,
  } = config;

  // Simulate spring via Euler integration
  const points = [];
  let position = 0;
  let velocity = 0;
  const target = 1;
  const dt = 1 / steps;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const springForce = -stiffness * (position - target);
    const dampingForce = -damping * velocity;
    const acceleration = (springForce + dampingForce) / mass;
    velocity += acceleration * dt;
    position += velocity * dt;
    points.push({ t, v: Math.min(Math.max(position, -0.5), 1.5) });
  }

  const values = points.map(p => p.v.toFixed(4)).join(', ');
  return `linear(${values})`;
}

// Named spring presets matching common Framer Motion defaults
export const SPRING_PRESETS = {
  'default':    { stiffness: 100, damping: 10, mass: 1 },
  'gentle':     { stiffness: 120, damping: 14, mass: 1 },
  'wobbly':     { stiffness: 180, damping: 12, mass: 1 },
  'stiff':      { stiffness: 210, damping: 20, mass: 1 },
  'slow':       { stiffness: 280, damping: 60, mass: 1 },
  'molasses':   { stiffness: 280, damping: 120, mass: 1 },
};

export function namedSpringToCss(presetName) {
  const preset = SPRING_PRESETS[presetName] || SPRING_PRESETS['default'];
  return springToCss(preset);
}