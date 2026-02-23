/**
 * User Profile — centralized user/org configuration for agent personalization.
 *
 * All fields are optional. When omitted, persona prompts fall back to
 * the current hardcoded defaults (Josh Mabry / protoLabs deployment).
 */
export interface UserProfile {
  /** User's full name (default: "Josh Mabry") */
  name?: string;
  /** User's title or role (default: "Architect, founder") */
  title?: string;
  /** Short bio for content agents */
  bio?: string;

  /** Discord integration */
  discord?: {
    /** Discord username (default: "chukz") */
    username?: string;
    /** Discord channel IDs */
    channels?: {
      /** Primary coordination channel */
      primary?: string;
      /** Dev updates channel */
      dev?: string;
      /** Infrastructure alerts channel */
      infra?: string;
      /** Deployment notifications channel */
      deployments?: string;
      /** Critical alerts channel */
      alerts?: string;
    };
  };

  /** Linear integration */
  linear?: {
    /** Linear team ID */
    teamId?: string;
    /** Linear "In Progress" state ID */
    inProgressStateId?: string;
  };

  /** GitHub integration */
  github?: {
    /** GitHub organization name */
    org?: string;
  };

  /** Brand identity */
  brand?: {
    /** Agency/company name (default: "protoLabs") */
    agencyName?: string;
    /** Product name (default: "protoMaker") */
    productName?: string;
    /** Internal codename (default: "Automaker") */
    internalCodename?: string;
    /** Primary domain (default: "protoLabs.studio") */
    domain?: string;
    /** Free-form brand voice guidelines */
    voice?: string;
  };

  /** Infrastructure */
  infra?: {
    /** Staging host (default: "100.101.189.45") */
    stagingHost?: string;
  };

  /** Additional Discord usernames allowed to interact with agents */
  additionalAllowedUsers?: string[];
}
