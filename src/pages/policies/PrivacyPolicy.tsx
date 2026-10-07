import { LegalLayout } from "../../components/LegalLayout";

/** TEMPORARY BASELINE — CLIENT POLICY REVIEW REQUIRED (spec #32/#34). See ReturnsPolicy.tsx. */
export default function PrivacyPolicy() {
  return (
    <LegalLayout eyebrow="Legal" title="Privacy Policy" date="30 September 2026">
      <p className="!text-accent font-semibold">
        CLIENT POLICY REVIEW REQUIRED — the terms below are a temporary baseline pending Delite
        Auto's own final privacy policy and legal review.
      </p>

      <h2>What we collect</h2>
      <p>
        Account details you provide (name, email, phone), delivery addresses, and order history.
        Guest checkout collects only what's needed to fulfil and confirm that one order.
      </p>

      <h2>How we use it</h2>
      <p>
        To process orders, provide customer support, and — where you've consented — send order
        and account-related communications. We do not sell your personal information.
      </p>

      <h2>Where it's stored</h2>
      <p>
        Your account and order data is stored with our commerce and authentication providers,
        secured with role-based access controls limiting who on our team can see it.
      </p>

      <h2>Your choices</h2>
      <p>
        You can review and update your profile from your account, and contact us to request
        deletion of your account data, subject to any records we're required to keep for order
        and tax purposes.
      </p>
    </LegalLayout>
  );
}
