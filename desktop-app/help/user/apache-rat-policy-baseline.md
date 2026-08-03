---
tags:
  - maven
  - licenses
  - apache-rat
  - project-policy
---
# Apache RAT policy baseline

Apache RAT audits files for recognized license evidence. A Maven policy normally declares `apache-rat-plugin`, optionally binds `check` to `verify`, and records only reviewed exceptions or custom matchers.

- `pluginManagement` supplies defaults but does not execute RAT.
- Exclusions stop inspection; they do not approve a license.
- Matchers recognize evidence; approved families record project policy.
- `rat.skip` bypasses the audit and is not a compliance fix.
- LICENSE, NOTICE, README, and third-party inventories have different legal and technical roles. Documentation alone does not clear a RAT finding.

MD-Editor provides technical guidance, not legal advice.
