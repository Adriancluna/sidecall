// Role 4: vendor fingerprints in public DNS. A match says "this domain points at this
// vendor": reachability, a candidate link, never a validated or shared credential.
//
// Each rule matches one record kind:
//   mx    – mail exchanger host ends with one of `suffixes`
//   spf   – an `include:` in the SPF TXT record ends with one of `suffixes`
//   txt   – a TXT record starts with one of `prefixes` (domain-verification tokens)
//   cname – <sub>.<domain> is a CNAME to a host ending with one of `suffixes`
// `assetName` ties a fingerprint to a seed asset (CONTRACT.md "DNS links"); only those
// become data/dns_links.json entries. Real vendors have none.

export const VENDORS = [
  // Seed vendors (fictional *.example hosts; used for the seed's simulated records)
  {
    vendor: "Relay Mail Co.",
    assetName: "Relay Mail",
    mx: ["relaymail.example"],
    spf: ["spf.relaymail.example"],
  },
  {
    vendor: "Keystone Identity",
    assetName: "Keystone SSO",
    cname: ["keystone-sso.example"],
    txt: ["keystone-site-verification="],
  },
  {
    vendor: "Ledgerly",
    assetName: "Ledgerly AP Portal",
    spf: ["spf.ledgerly.example"],
    txt: ["ledgerly-domain-verification="],
  },
  {
    vendor: "Brightline Payroll Inc.",
    assetName: "Brightline Payroll",
    cname: ["brightlinepayroll.example"],
  },
  {
    vendor: "Ironclad Managed IT",
    assetName: "Ironclad IT Services",
    cname: ["ironclad-it.example"],
  },

  // Real vendors (for the scan of real public domains)
  {
    vendor: "Google Workspace",
    mx: ["google.com", "googlemail.com"],
    spf: ["_spf.google.com"],
  },
  {
    vendor: "Microsoft 365",
    mx: ["mail.protection.outlook.com"],
    spf: ["spf.protection.outlook.com"],
    txt: ["MS=ms"],
    cname: ["autodiscover.outlook.com"],
  },
  {
    vendor: "Proofpoint",
    mx: ["pphosted.com", "ppe-hosted.com"],
    spf: ["pphosted.com"],
  },
  { vendor: "Mimecast", mx: ["mimecast.com"], spf: ["mimecast.com"] },
  { vendor: "Barracuda", mx: ["barracudanetworks.com"] },
  { vendor: "Cisco Secure Email", mx: ["iphmx.com"], spf: ["iphmx.com"] },
  { vendor: "Amazon SES", spf: ["amazonses.com"] },
  { vendor: "SendGrid", spf: ["sendgrid.net"] },
  { vendor: "Mailgun", spf: ["mailgun.org"] },
  { vendor: "Mailchimp", spf: ["servers.mcsv.net", "spf.mandrillapp.com"] },
  {
    vendor: "Salesforce",
    spf: ["_spf.salesforce.com"],
    txt: ["salesforce-site-verification="],
  },
  {
    vendor: "Zendesk",
    spf: ["mail.zendesk.com"],
    txt: ["zendeskverification="],
    cname: ["zendesk.com"],
  },
  { vendor: "HubSpot", spf: ["hubspotemail.net"] },
  {
    vendor: "Atlassian",
    spf: ["_spf.atlassian.net"],
    txt: ["atlassian-domain-verification="],
    cname: ["atlassian.net", "statuspage.io"],
  },
  { vendor: "Okta", cname: ["okta.com", "oktapreview.com"] },
  { vendor: "Auth0", cname: ["auth0.com"] },
  { vendor: "OneLogin", cname: ["onelogin.com"] },
  { vendor: "ServiceNow", cname: ["service-now.com"] },
  { vendor: "DocuSign", txt: ["docusign="] },
  {
    vendor: "Adobe",
    txt: ["adobe-idp-site-verification=", "adobe-sign-verification="],
  },
  { vendor: "Apple", txt: ["apple-domain-verification="] },
  { vendor: "Dropbox", txt: ["dropbox-domain-verification="] },
  { vendor: "Slack", txt: ["slack-domain-verification="] },
  { vendor: "Zoom", txt: ["ZOOM_verify_"] },
  {
    vendor: "Cisco Webex",
    txt: ["webexdomainverification", "cisco-ci-domain-verification="],
  },
  { vendor: "OneTrust", txt: ["onetrust-domain-verification="] },
  { vendor: "KnowBe4", txt: ["knowbe4-site-verification="] },
  { vendor: "Stripe", txt: ["stripe-verification="] },
  { vendor: "Miro", txt: ["miro-verification="] },
];

// Subdomains worth a CNAME lookup: login portals, mail autodiscovery, help desks, status pages.
export const CNAME_SUBDOMAINS = [
  "autodiscover",
  "sso",
  "login",
  "auth",
  "id",
  "help",
  "support",
  "status",
  "payroll",
  "hr",
  "it",
];

// Seed assets a DNS link must never point at: they are the demo incidents, and a new link
// there changes the headline (3 · 4,200 · $612K) and the answer key (CONTRACT.md).
export const DEMO_INCIDENT_ASSETS = [
  "Brightline Payroll",
  "Ironclad IT Services",
  "Ironclad shared admin account",
];
