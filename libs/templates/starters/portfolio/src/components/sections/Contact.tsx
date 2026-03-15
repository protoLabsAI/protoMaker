/**
 * Contact section — React island with social links and a validated contact form.
 *
 * The form submission is intentionally stubbed (simulated delay + success state).
 * Replace the `submitForm` function with your own endpoint (Formspree, Netlify
 * Forms, a serverless function, etc.) before going live.
 *
 * Usage (in an .astro file):
 *   import Contact from '@/components/sections/Contact';
 *   <Contact client:load email={config.email} github={config.social.github} />
 */

import { useState } from "react";

export interface ContactProps {
  email?: string;
  github?: string;
  twitter?: string;
  linkedin?: string;
}

type FormState = "idle" | "submitting" | "success" | "error";

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

function validate(data: FormData): FormErrors {
  const errors: FormErrors = {};

  if (!String(data.get("name") ?? "").trim()) {
    errors.name = "Name is required.";
  }

  const emailVal = String(data.get("email") ?? "").trim();
  if (!emailVal) {
    errors.email = "Email is required.";
  } else if (!/^\S+@\S+\.\S+$/.test(emailVal)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!String(data.get("message") ?? "").trim()) {
    errors.message = "Message is required.";
  }

  return errors;
}

/** Replace with your real submission logic. */
async function submitForm(_data: FormData): Promise<void> {
  // e.g. await fetch('/api/contact', { method: 'POST', body: data });
  await new Promise<void>((resolve) => setTimeout(resolve, 900));
}

export default function Contact({
  email,
  github,
  twitter,
  linkedin,
}: ContactProps) {
  const [formState, setFormState] = useState<FormState>("idle");
  const [errors, setErrors] = useState<FormErrors>({});

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const validationErrors = validate(data);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setFormState("submitting");

    try {
      await submitForm(data);
      setFormState("success");
    } catch {
      setFormState("error");
    }
  }

  if (formState === "success") {
    return (
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-2xl"
          style={{ background: "rgba(74, 222, 128, 0.15)" }}
          aria-hidden="true"
        >
          ✓
        </div>
        <h3 className="mb-2 text-xl font-bold text-white">Message sent!</h3>
        <p style={{ color: "#a1a1aa" }}>
          Thanks for reaching out — I&apos;ll get back to you soon.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h2 className="mb-2 text-2xl font-bold text-white">Get in touch</h2>
      <p
        className="mb-8 text-base leading-relaxed"
        style={{ color: "#a1a1aa" }}
      >
        Open to freelance projects, consulting, and full-time opportunities. If
        you have an idea worth solving, I&apos;d love to hear about it.
      </p>

      {/* ── Social / direct links ──────────────────────────────── */}
      {(email || github || twitter || linkedin) && (
        <div className="mb-10 flex flex-wrap gap-3">
          {email && (
            <a
              href={`mailto:${email}`}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90"
              style={{ background: "var(--color-accent)" }}
            >
              Email me
            </a>
          )}
          {github && (
            <a
              href={github}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border px-5 py-2.5 text-sm font-semibold text-white no-underline transition-colors"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              GitHub
            </a>
          )}
          {twitter && (
            <a
              href={twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border px-5 py-2.5 text-sm font-semibold text-white no-underline transition-colors"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              Twitter / X
            </a>
          )}
          {linkedin && (
            <a
              href={linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border px-5 py-2.5 text-sm font-semibold text-white no-underline transition-colors"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              LinkedIn
            </a>
          )}
        </div>
      )}

      {/* ── Contact form ───────────────────────────────────────── */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Name */}
        <div>
          <label
            htmlFor="contact-name"
            className="mb-1.5 block text-sm font-medium text-white"
          >
            Name
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Jane Smith"
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none transition-colors"
            style={{
              background: "var(--color-surface-2)",
              border: `1px solid ${errors.name ? "var(--color-danger)" : "var(--border-subtle)"}`,
            }}
          />
          {errors.name && (
            <p
              className="mt-1.5 text-xs"
              role="alert"
              style={{ color: "var(--color-danger)" }}
            >
              {errors.name}
            </p>
          )}
        </div>

        {/* Email */}
        <div>
          <label
            htmlFor="contact-email"
            className="mb-1.5 block text-sm font-medium text-white"
          >
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="jane@example.com"
            className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none transition-colors"
            style={{
              background: "var(--color-surface-2)",
              border: `1px solid ${errors.email ? "var(--color-danger)" : "var(--border-subtle)"}`,
            }}
          />
          {errors.email && (
            <p
              className="mt-1.5 text-xs"
              role="alert"
              style={{ color: "var(--color-danger)" }}
            >
              {errors.email}
            </p>
          )}
        </div>

        {/* Message */}
        <div>
          <label
            htmlFor="contact-message"
            className="mb-1.5 block text-sm font-medium text-white"
          >
            Message
          </label>
          <textarea
            id="contact-message"
            name="message"
            rows={5}
            placeholder="Tell me about your project..."
            className="w-full resize-y rounded-lg px-4 py-2.5 text-sm text-white outline-none transition-colors"
            style={{
              background: "var(--color-surface-2)",
              border: `1px solid ${errors.message ? "var(--color-danger)" : "var(--border-subtle)"}`,
            }}
          />
          {errors.message && (
            <p
              className="mt-1.5 text-xs"
              role="alert"
              style={{ color: "var(--color-danger)" }}
            >
              {errors.message}
            </p>
          )}
        </div>

        {/* Error banner */}
        {formState === "error" && (
          <p
            className="rounded-lg px-4 py-3 text-sm"
            role="alert"
            style={{
              background: "rgba(248, 113, 113, 0.1)",
              color: "var(--color-danger)",
              border: "1px solid rgba(248, 113, 113, 0.2)",
            }}
          >
            Something went wrong. Please try again or email me directly.
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={formState === "submitting"}
          className="w-full rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: "var(--color-accent)" }}
        >
          {formState === "submitting" ? "Sending…" : "Send message"}
        </button>
      </form>
    </section>
  );
}
