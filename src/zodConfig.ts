import { z } from 'zod'

// The deploy ships a strict CSP (script-src 'self', no 'unsafe-eval'). zod's JIT probes with `new Function`,
// which the CSP blocks and reports; `jitless` is zod's documented switch for this. Import before any schema is built.
z.config({ jitless: true })
