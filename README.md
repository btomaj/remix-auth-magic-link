# MagicLinkStrategy

A Remix Auth strategy for passwordless authentication using magic links. This strategy is unopinionated about how you share the magic link with the user. You can use email, SMS, or any other channel of your choice.

This strategy implements magic link authentication by creating a unique token that allows users to sign in without a password. This allows you to implement Kent C. Dodds' [authentication with magic links](https://kentcdodds.com/blog/how-i-built-a-modern-website-in-2021#authentication-with-magic-links) authentication strategy.

## Supported runtimes

| Runtime    | Has Support |
| ---------- | ----------- |
| Node.js    | ✅          |
| Cloudflare | ❓          |

Cloudflare needs to be tested and validated. Please submit a discussion if you have validated it.

## How to use

First, install the strategy and Remix Auth.

> [!WARNING]
> This package is not yet published on npm as `remix-auth-magic-link`. Clone and build.

```bash
$ npm install remix-auth remix-auth-magic-link
```
```bash
$ yarn add remix-auth remix-auth-magic-link
```
```bash
$ pnpm add remix-auth remix-auth-magic-link
```

Second, create an Authenticator instance and use an instance of MagicLinkStrategy with it. The MagicLinkStrategy constructor requires an "options" object and a "verify" function as parameters. You'll use the "verify" function as part of the authentication flow to:
1. store the key used to verify the magic link,
2. send the magic link to the user,
3. authorize the user when they follow the magic link, and
4. create an authenticated session for the user.

> [!CAUTION]
> Exposing `key` to the user, for example by storing it in a cookie, creates a security flaw that allows the user to log in to any account

```ts
// ~/auth/strategy.server.ts
import type { User } from "~/models/user";
import { Authenticator } from "remix-auth";
import { MagicLinkStrategy } from "remix-auth-magic-link";

export let authenticator = new Authenticator<User>();

authenticator.use(
  new MagicLinkStrategy(
    {
      // expiresIn: number; [optional] seconds until magic link expires; defaults to 600 (5 minutes).
    },
    async ({ form, token, key }) => {
      if (key) { // send magic link
        // 🛑 NEVER expose `key` to the user
        // 👉 NB: `form` is a FormData instance, e.g.:
        const contactDetail = form.get("contactDetail");
        // 1. store `key` in a session
        // 2. construct a magic link to your callback route with `token` in the query string
        // 3. extract the user's contact detail from the FormData instance
        // 3. send the magic link to user
      } else { // authenticate the user
        // 👉 NB: `form` is a plain object, e.g.:
        const contactDetail = form.contactDetail;
        // 1. lookup or create a user in your database, e.g.:
        const user: User = await findOrCreateUser(form.contactDetail);
        // 2. create an authenticated session for the user
        // 3. [optional] delete the temporary session in which you stored `key` to enforce single use
        return user;
      }
    }
  )
);
```

> [!NOTE]
> When the user submits the login form, `form` is your login form as FormData, and when the user follows the magic link, `form` is your login form as a plain object. FormData is transformed through `Object.fromEntries()` such that `form.get('contactDetail')` equals `form.contactDetails`.

Then, in your login route, you create a form to collect the user's contact detail. The FormData object is accessible through `form` in the "verify" function you passed to `MagicLinkStrategy` above.

```tsx
// ~/auth.login.tsx
import authenticator from "~/auth/strategy.server";

export async function action({ request }: Route.ActionArgs) {
  await authenticator.authenticate("magic-link", request);
  // When we get here, the magic link must have been sent
  // Now, update the UI to inform them user the magic link has been sent
}

export default function Login() {
  return (
    <Form method="post">
      <label htmlFor="email">Contact detail</label>
      <input type="input" name="contactDetail" id="contactDetail" required />
      <button type="submit">Send Magic Link</button>
    </Form>
  );
}
```

When the user follows the magic link to your callback route, retrieve the key, append it to the request url, authenticate the magic link, and redirect the user to their end destination.

```tsx
// ~/auth.callback.tsx
import authenticator from "~/auth/strategy.server";

export async function loader({ request }: Route.LoaderArgs) {
  // 1. retrieve `key` from session
  const key = ...
  // 2. add `key` to query string parameters of request URL
  const authUrl = request.url + "&key=" + key;
  // 3. pass the request URL with key to `authenticate`
  const user = authenticator.authenticate("magic-link", new Request(authUrl, request));
  // 4. redirect the user
}
```

## Advanced use cases

### Using SMS, or other channels
You can collect any information from the form on the login route, and it will be passed to the "verify" function that you defined for `MagicLinkStrategy`. You can collect SMS, or any other contact information, and use it to send the magic link.

### Post log-in redirect
When you throw a redirect to the log-in route from a restricted route, you can add a redirect query string parameter to the rediret URL containing the encoded URL of the restricted route. From the log in route, you can add the redirect URL in the form, append it to the magic link in your "verify" function, and when the user follows the magic link, redirect the user to the URL when authentication is complete.

```tsx
//  ~/auth.login.tsx

export asycn function loader({ request, params }: Route.LoaderArgs) {
  return json({ redirectTo: params.redirectTo });
}

export default function Login() {
  const data = useLoaderData<typeof loader>();

  return (
    <Form method="post">
      <label htmlFor="email">Contact detail</label>
      <input type="input" name="contactDetail" id="contactDetail" required />
      <input type="input" name="redirectTo" id="redirectTo" value={data.redirectTo} hidden />
      <button type="submit">Send Magic Link</button>
    </Form>
  );
}
```

```tsx
// ~/auth/strategy.server.ts
...

authenticator.use(
  new MagicLinkStrategy(
    {},
    async ({ form, token, key }) => {
      if (key) { // send magic link
        ...
        const redirectTo = form.get("redirectTo");
        // append redirectTo to magic link before sending
      } else { // authenticate the user
        ...
      }
    }
  )
);
```

```tsx
// ~/auth.callback.tsx
import { redirect } from "react-router";
...

export async function loader({ request, params }: Route.LoaderArgs) {
  ...
  const user = authenticator.authenticate("magic-link", new Request(authUrl, request));
  const redirectTo = params.redirectTo;

  if (redirectTo) {
    throw redirect(redirectTo);
  }
}
...
```

### Single-use enforcement
In your "verify" function, you can ensure that each magic link is only used once by deleting the temporary session that stores `key`.

### Rate-limiting
You can use libraries like [bottleneck](https://www.npmjs.com/package/bottleneck) and [limiter](https://www.npmjs.com/package/limiter) to rate limit the number of magic links that are generated.

### Concurrency checks
You can prevent having more than one active magic link per user by storing the contact detail in the temporary session, and invalidating previous sessions when a user creates a new magic link for the same contact detail.
