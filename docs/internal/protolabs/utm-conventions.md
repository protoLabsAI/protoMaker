# UTM Parameter Conventions

This page covers how protoLabs tracks marketing campaign attribution using UTM parameters. After reading it, you will understand the naming conventions, how to add new campaigns, and how to generate properly tagged links for social media sharing.

## What are UTM parameters?

UTM parameters are query string values appended to URLs that tell Umami analytics where traffic originated. Example:

```
https://protolabs.studio?utm_source=twitter&utm_medium=social&utm_campaign=launch
```

Umami captures these values automatically — no code changes needed. They appear in the dashboard under "Query Parameters" and can be used to filter all metrics by source, medium, or campaign.

## Parameter definitions

### utm_source (required)

Where the link appears or where the traffic originates.

| Value         | When to use                                                |
| ------------- | ---------------------------------------------------------- |
| `protolabs`   | Links FROM our site to external destinations (nav, footer) |
| `twitter`     | Links shared on Twitter/X                                  |
| `twitch`      | Links in Twitch stream descriptions                        |
| `youtube`     | Links in YouTube video descriptions                        |
| `substack`    | Links in Substack newsletter                               |
| `github`      | Links in GitHub READMEs or issues                          |
| `linkedin`    | Links shared on LinkedIn                                   |
| `discord`     | Links shared in Discord                                    |
| `hacker-news` | Links posted to Hacker News                                |

### utm_medium (required)

The marketing channel type.

| Value        | When to use                                                |
| ------------ | ---------------------------------------------------------- |
| `social`     | Social media posts (Twitter, LinkedIn)                     |
| `video`      | Video platforms (Twitch, YouTube)                          |
| `newsletter` | Email newsletter (Substack)                                |
| `community`  | Community forums (Discord, Hacker News)                    |
| `referral`   | Cross-site links between protoLabs subdomains              |
| `website`    | Links from our site to external destinations (nav, footer) |

### utm_campaign (required)

The specific campaign or placement context.

| Value                  | When to use                              |
| ---------------------- | ---------------------------------------- |
| `nav`                  | Header navigation links                  |
| `footer`               | Footer links                             |
| `cross-nav`            | Links between protoLabs subdomains       |
| `github-nav`           | Links to GitHub org/repos from site      |
| `social-nav`           | Links to social media profiles from site |
| `launch`               | Product launch campaigns                 |
| `feature-announcement` | New feature releases                     |
| `changelog-update`     | Monthly changelog update posts           |
| `roadmap-update`       | Roadmap milestone announcements          |
| `weekly-update`        | Regular weekly newsletter                |
| `organic`              | Non-campaign organic shares              |

## Core rules

1. **Lowercase only** — `twitter` not `Twitter`
2. **Dashes for spaces** — `feature-announcement` not `feature announcement`
3. **No special characters** — avoid `&`, `=`, `?` in values
4. **External links only** — never add UTM params to same-page anchors or JavaScript
5. **Consistent naming** — use values from this list or add them to `utm-config.json` first

## Automated injection

The build script `site/scripts/add-utm-params.mjs` automatically injects UTM parameters into all external links in the site HTML files. It runs as the final step of `npm run stats:generate`.

```bash
# Run UTM injection manually
npm run add-utm-params

# Run as part of full site generation
npm run stats:generate
```

The script reads rules from `site/scripts/utm-config.json` and is idempotent — running it multiple times produces the same output.

## Inbound campaign links

When sharing protoLabs content on social media, tag the link before sharing:

```
# Sharing on Twitter after a changelog update
https://changelog.protolabs.studio?utm_source=twitter&utm_medium=social&utm_campaign=changelog-update

# Sharing roadmap update in Twitch stream description
https://roadmap.protolabs.studio?utm_source=twitch&utm_medium=video&utm_campaign=roadmap-update

# Sharing in Substack newsletter
https://protolabs.studio?utm_source=substack&utm_medium=newsletter&utm_campaign=weekly-update

# Posting on Hacker News
https://protolabs.studio?utm_source=hacker-news&utm_medium=community&utm_campaign=launch
```

## Adding a new campaign

1. Add the campaign name to the `campaign` array in `site/scripts/utm-config.json`
2. Use the new campaign value when generating tagged links
3. Run `npm run test:utm` to confirm no convention violations

To add a new tracked destination (e.g., a new external link added to the site nav):

1. Add a rule to the `rules` array in `site/scripts/utm-config.json`:
   ```json
   {
     "match": "example.com/your-profile",
     "source": "protolabs",
     "medium": "website",
     "campaign": "nav",
     "description": "Link from site nav to your profile"
   }
   ```
2. Run `npm run add-utm-params` to apply to HTML files
3. Run `npm run test:utm` to verify

## Validation

Run the automated test suite to verify all UTM parameters are correct:

```bash
npm run test:utm
```

Expected output:

```
ok 1 - All external links matching rules have UTM parameters
ok 2 - All UTM parameter values are lowercase
ok 3 - All UTM values match utm-config.json conventions
ok 4 - Script is idempotent — running twice produces identical output

1..4
# tests 4
# pass  4
```

## Viewing data in Umami

1. Log in to `umami.proto-labs.ai`
2. Select a website (e.g., protolabs.studio)
3. Navigate to "Query Parameters" in the left sidebar
4. UTM parameters appear as filterable dimensions
5. Click any value to filter the entire dashboard by that campaign

## Next steps

- **[Content pipeline](./content-pipeline.md)** — How content is produced and published
- **[Brand guidelines](./brand.md)** — Voice, naming conventions, and brand rules
