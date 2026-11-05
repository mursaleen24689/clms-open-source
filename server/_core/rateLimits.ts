import rateLimit from "express-rate-limit";

/**
 * Rate limiting for the CLMS API.
 *
 * This lives in its own module because the limiters are needed by the REST
 * routes in `index.ts` and by the session routes in `oauth.ts`.
 *
 * How the layers fit together:
 *
 *   - `apiLimiter` is mounted once on `/api` and catches everything, including
 *     the tRPC mount. It is deliberately generous: this is an intranet system
 *     used by a few hundred staff at their workstations, not a public API, and
 *     a limit that interrupts normal office work gets switched off by the
 *     administrator rather than fixed.
 *   - The other limiters are attached to individual routes and form the strict
 *     layer. Each is a separate counter with its own window, so hammering the
 *     login form does not use up the budget for reading a dashboard, and the
 *     person who is blocked is told which action they overused.
 *
 * TWO RULES FOR WHOEVER EDITS THIS FILE NEXT (including an LLM):
 *
 *   1. The key comes from `req.ip`, which Express only derives from the
 *      `X-Forwarded-For` header when `trust proxy` is configured (see
 *      `configureTrustProxy` in `index.ts`). Put the app behind a reverse proxy
 *      without that setting and `req.ip` becomes the proxy's address, so every
 *      user on campus shares one bucket and one person's mistake blocks the
 *      whole building. Set it too permissively (`trust proxy: true`) and the
 *      header is attacker-controlled, so each request can ask for a fresh
 *      bucket. express-rate-limit detects both and complains at startup: it
 *      refuses to run with `trust proxy: true` and warns when it sees the
 *      header while Express is configured to ignore it.
 *   2. Do not build the key out of anything a client can vary per request (the
 *      raw `X-Forwarded-For` string, the user agent, a query parameter, a
 *      session id). That splits one person across many buckets, which is the
 *      same as having no limit at all - and the opposite mistake, collapsing
 *      the fallback label of an unresolvable address into a shared bucket,
 *      blocks everyone at once. The library's default key generator is used on
 *      purpose: it keys on `req.ip` and groups IPv6 addresses by their /56
 *      subnet, so one customer connection stays in one bucket without merging
 *      all of IPv6 into a single bucket.
 *
 * The 429 body is `{ error: "..." }` because that is the shape the existing
 * client already reads (`data.error` on the login page and
 * `toast.error(data.error || ...)` in the dashboards) - any other key would
 * reach the screen as an empty message. The remaining quota and the wait time
 * are in the standard `RateLimit-*` and `Retry-After` response headers, which
 * `standardHeaders: "draft-7"` turns on and the deprecated `X-RateLimit-*`
 * equivalents stay off with `legacyHeaders: false`.
 */

/** The shared 429 body; `area` names what the user was doing. */
function tooManyRequests(area: string) {
  return {
    error:
      `Too many requests to ${area} from this computer. ` +
      "Please wait a moment and try again.",
  };
}

/**
 * A generous ceiling for ordinary API traffic.
 *
 * 600 requests per minute per client: one dashboard load fires roughly ten
 * requests, so this leaves more than an order of magnitude of headroom for a
 * shared workstation or a projector machine, while still stopping a script,
 * which would otherwise issue thousands of database-backed requests a minute.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("the leave system"),
});

/**
 * Login and session creation. `skipSuccessfulRequests` means the counter only
 * grows on rejected attempts (401/400), so staff signing in at a shared
 * computer are never punished for other people's typos, while a guessing run
 * is capped at ten rejected tries per quarter of an hour per machine. This is
 * the request-volume layer; the sixties lockout after five failures on one
 * address is the separate `loginRateLimiter` in `index.ts`.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: tooManyRequests("signing in"),
});

/**
 * The captcha endpoint feeds the login form, and every challenge that is never
 * answered sits in memory for five minutes. Sixty per window is far more than
 * someone reloading the login page needs, and it also caps how much memory the
 * challenge map can be forced to hold.
 */
export const captchaLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("the security code"),
});

/**
 * The password workflow. `POST /api/forgot-password` is unauthenticated and
 * writes a support ticket plus an audit row for every accepted request, and
 * the password-change routes run several bcrypt hashes each, which is the most
 * CPU a single request can buy here. Five per hour is plenty for a user who
 * forgot their password and has to wait for an administrator anyway.
 */
export const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("the password reset workflow"),
});

/**
 * Administrative writes: accounts, roles, balances, the year-end quota, the
 * holiday list, profile request decisions. Ninety per five minutes is about one
 * click every three seconds for the whole window, which no real office workflow
 * needs, but it slows a leaked administrator token from rewriting the
 * directory before anyone notices.
 */
export const adminWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 90,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("the administration area"),
});

/**
 * Ordinary per-route traffic: the record reads that every dashboard calls on
 * load (own details, own leave history, the pending list, the holiday list,
 * notifications, the supervisor list, the memo list) and the tRPC procedures.
 * 300 requests per minute per client sits between the generous site-wide
 * ceiling and the strict buckets, and is listed per route because each of these
 * endpoints answers with a database query - including the one behind session
 * validation - so an unbounded loop here is the cheapest way to starve the
 * shared MySQL server.
 */
export const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("the leave records"),
});

/**
 * Leave decisions and withdrawals. An approving head of department works
 * through a stack quickly, so this is looser than the administration bucket,
 * but each decision is a database transaction that touches a balance.
 */
export const leaveWriteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("leave applications"),
});

/**
 * Attachments and profile pictures: these decode up to 5 MB of base64 and write
 * to the `uploads/` folder or a LONGTEXT column, which is the most expensive
 * normal request on a shared mechanical disk. Ten minutes per window still lets
 * someone file a stack of support tickets in one sitting.
 */
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("file uploads"),
});

/**
 * Downloading a support attachment: administrator only, and it streams a file
 * from disk, so it keeps its own bucket.
 */
export const downloadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("attachment downloads"),
});

/**
 * The wide reports. `GET /api/admin/employees-detailed` reads every leave
 * application in the database and aggregates it per employee, and the ticket
 * and profile-request lists return stored base64 images; the client then builds
 * the printable and Excel export out of that single response. Thirty per minute
 * keeps printing and exporting comfortable and stops a refresh loop from
 * pinning the CPU and the disk.
 */
export const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("the reports and registers"),
});

/**
 * Internal memos: long-text bodies on every write, with a per-user scan on
 * read. Forty writes per ten minutes is more memo drafting than a department
 * produces.
 */
export const memoWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: tooManyRequests("the memo system"),
});
