import { defineCollection, z } from 'astro:content';

const siteConfig = defineCollection({
  type: 'data',
  schema: z.object({
    brand: z.object({
      name: z.string(),
      tagline: z.string(),
      description: z.string(),
    }),
    nav: z.object({
      links: z.array(
        z.object({
          label: z.string(),
          href: z.string(),
          external: z.boolean().optional(),
        })
      ),
      cta: z
        .object({
          label: z.string(),
          href: z.string(),
        })
        .optional(),
    }),
    footer: z.object({
      tagline: z.string(),
      links: z.array(
        z.object({
          label: z.string(),
          href: z.string(),
          external: z.boolean().optional(),
        })
      ),
    }),
    social: z
      .object({
        twitter: z.string().optional(),
        github: z.string().optional(),
        discord: z.string().optional(),
        linkedin: z.string().optional(),
      })
      .optional(),
  }),
});

const sections = defineCollection({
  type: 'data',
  schema: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('stats'),
      items: z.array(
        z.object({
          value: z.string(),
          label: z.string(),
        })
      ),
    }),
    z.object({
      type: z.literal('features'),
      label: z.string(),
      heading: z.string(),
      items: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
        })
      ),
    }),
    z.object({
      type: z.literal('steps'),
      label: z.string(),
      heading: z.string(),
      items: z.array(
        z.object({
          title: z.string(),
          description: z.string(),
          link: z
            .object({
              label: z.string(),
              href: z.string(),
            })
            .optional(),
        })
      ),
    }),
    z.object({
      type: z.literal('pricing'),
      label: z.string(),
      heading: z.string(),
      tiers: z.array(
        z.object({
          name: z.string(),
          price: z.string(),
          period: z.string().optional(),
          description: z.string(),
          features: z.array(z.string()),
          cta: z.object({
            label: z.string(),
            href: z.string(),
          }),
          highlighted: z.boolean().optional(),
        })
      ),
    }),
    z.object({
      type: z.literal('faq'),
      label: z.string(),
      heading: z.string(),
      items: z.array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      ),
    }),
    z.object({
      type: z.literal('testimonials'),
      label: z.string(),
      heading: z.string(),
      items: z.array(
        z.object({
          quote: z.string(),
          name: z.string(),
          role: z.string(),
          company: z.string().optional(),
        })
      ),
    }),
  ]),
});

export const collections = { siteConfig, sections };
