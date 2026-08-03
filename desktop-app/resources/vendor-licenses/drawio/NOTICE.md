# Bundled diagram editor notice

MD-Editor bundles a locally configured copy of the draw.io client-side editor.

- Upstream project: <https://github.com/jgraph/drawio>
- Pinned version: `30.0.4`
- Pinned commit: `201b8601fb9f07a4b3a4cba03212b1aa122cec06`
- Source license: Apache License 2.0

MD-Editor replaces the upstream `js/PreConfig.js` and `js/PostConfig.js` deployment
templates, injects an offline content-security policy and local stylesheet into
`index.html`, and packages only the client-side runtime directories listed in
`desktop-app/drawio-vendor.json`.

The draw.io name and logo are not used as MD-Editor product branding. The upstream
README separately restricts using or distributing the included icon sets and stencil
libraries as software assets in Atlassian products or its marketplace/plugin ecosystem
without explicit written permission. The restriction does not apply to end-user output.
