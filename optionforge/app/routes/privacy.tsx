import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "OptionForge — Privacy Policy" },
  { name: "robots", content: "index,follow" },
];

// Public, unauthenticated page. Linked as the app's Privacy Policy URL in the
// Shopify Partner Dashboard listing (required for public-app submission).
export default function Privacy() {
  const updated = "June 2026";
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "48px auto",
        padding: "0 20px 64px",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        color: "#1a1a1a",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 32 }}>OptionForge Privacy Policy</h1>
      <p style={{ color: "#637381" }}>Last updated: {updated}</p>

      <p>
        OptionForge ("the App", "we", "us") adds custom product options to Shopify
        stores. This policy explains what data we process, why, and the choices
        available to merchants and their customers.
      </p>

      <h2>Data we collect</h2>
      <ul>
        <li>
          <strong>Merchant / store data:</strong> your store domain, an encrypted
          Shopify access token, plan and usage counters, and the option sets,
          templates, and settings you create in the App.
        </li>
        <li>
          <strong>Customer option selections:</strong> when a shopper configures a
          product, the values they enter (text, choices, dimensions, uploaded
          files) are stored as a submission so the order can be fulfilled.
        </li>
        <li>
          <strong>Uploaded files:</strong> images or documents a shopper uploads
          for a custom option, stored on object storage with a limited retention
          period.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Solely to provide the App's functionality: rendering options on your
        storefront, applying upcharges, generating option sets with AI, importing
        from other apps, and showing submissions in your admin. We do not sell
        personal data or use it for advertising.
      </p>

      <h2>AI processing</h2>
      <p>
        When you use AI Studio, the prompt you provide is sent to our LLM provider
        to generate an option set. Prompts are sanitized and are not used to train
        third-party models.
      </p>

      <h2>Data sharing</h2>
      <p>
        We share data only with infrastructure providers needed to run the App
        (hosting, database, object storage, and the AI provider), each acting as a
        processor under contract. We disclose data if required by law.
      </p>

      <h2>Retention &amp; deletion</h2>
      <p>
        Uploaded files expire automatically after their retention window. When you
        uninstall the App, or upon a Shopify <code>shop/redact</code> request, we
        delete your store's data. We honor Shopify's mandatory{" "}
        <code>customers/data_request</code> and <code>customers/redact</code>{" "}
        webhooks to fulfil customer data and deletion requests.
      </p>

      <h2>Your rights (GDPR / CCPA)</h2>
      <p>
        Shoppers may request access to or deletion of their data through the
        merchant, who can forward the request to us. Merchants can request export
        or deletion at any time by contacting us.
      </p>

      <h2>Security</h2>
      <p>
        Access tokens are encrypted at rest (AES-256-GCM). Data is transmitted
        over HTTPS. Access to production systems is restricted.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or data requests: <a href="mailto:marketplace@deodap.com">marketplace@deodap.com</a>.
      </p>
    </main>
  );
}
