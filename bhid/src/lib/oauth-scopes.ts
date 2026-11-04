export const OPTIONAL_OAUTH_SCOPE_GROUPS = [
  {
    label: "Basic",
    scopes: [
      ["email", "Email address and email-verification state"],
      [
        "profile",
        "Display name, username, profile picture, bio, and date of birth",
      ],
      ["bhid", "Human-facing BHID identifier"],
    ],
  },
  {
    label: "Standard",
    scopes: [
      ["verification", "Identity verification level and tier"],
      ["wallet", "Linked wallet addresses and ownership status"],
      ["membership", "Paid membership tier and expiry"],
    ],
  },
] as const;
