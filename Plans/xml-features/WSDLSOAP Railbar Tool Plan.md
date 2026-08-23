# WSDL/SOAP Railbar Tool Plan

## Summary
Add a dedicated **SOAP Client** railbar tool, separate from the generic API Client, focused on WSDL/SOAP service testing. V1 should support importing a WSDL, browsing services/ports/operations in the sidebar, generating editable SOAP envelopes, sending requests through the existing API Client HTTP bridge, and viewing formatted XML responses.

## Expected files to change:
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/js/tabs/view-manager.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/view-manager.js)
- [desktop-app/resources/js/tabs/index.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/index.js)
- [desktop-app/resources/js/tabs/persistence.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/persistence.js)
- [desktop-app/resources/js/sidebar/rail-preferences.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/sidebar/rail-preferences.js)
- [desktop-app/resources/styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- New files under `desktop-app/resources/js/tools/soap-client/`

## Key Changes
- Add a new rail icon:
  - `data-sidebar-rail-icon="soap-client"`
  - `data-sidebar-view="soap-client"`
  - Label: `SOAP`
  - Icon: `bi-diagram-3` or `bi-braces-asterisk`
  - Add Railbar settings visibility switch: `Show SOAP Client`.

- Add a SOAP sidebar panel:
  - Header: `SOAP Client`
  - Actions: `Import WSDL`, `Refresh`, `New request`.
  - Tabs: `WSDL`, `History`.
  - WSDL tree hierarchy: WSDL document -> service -> port -> operation.
  - Selecting an operation opens or updates a SOAP request tab.

- Add SOAP request tab type:
  - Tab type: `soap-client`
  - Title format: `SOAP: {operationName}`
  - Layout:
    - Top configuration row: WSDL URL/file name, service, port, operation, endpoint URL, SOAP version.
    - Request XML editor.
    - Response XML editor.
    - Response metadata: status, duration, content type, size.
    - Buttons: `Send`, `Format`, `Copy request`, `Copy response`.

- Add WSDL parsing module:
  - Parse WSDL 1.1 only for V1.
  - Extract:
    - `definitions`
    - `service`
    - `port`
    - `binding`
    - `portType`
    - `operation`
    - SOAP address endpoint
    - SOAPAction
    - input/output message names
    - inline XSD schema elements where available.
  - Unsupported WSDL shapes should show a clear diagnostic, not fail silently.

- Add SOAP envelope generation:
  - Generate SOAP 1.1 envelope by default.
  - Use SOAP 1.2 when binding indicates SOAP 1.2 or user selects it.
  - Use operation input message/schema to generate stub values.
  - Reuse existing XML stub-generation logic where possible.
  - Fallback envelope should still be generated when schema details are incomplete.

- Add request sending:
  - Use existing API Client bridge instead of new networking code.
  - Send `POST` to selected endpoint.
  - SOAP 1.1 headers:
    - `Content-Type: text/xml; charset=utf-8`
    - `SOAPAction: "{soapAction}"`
  - SOAP 1.2 headers:
    - `Content-Type: application/soap+xml; charset=utf-8; action="{soapAction}"`
  - Respect existing API Client request settings: timeout, proxy, TLS verification, trusted certificates, redirects, decompression, response size limit.
  - Render XML response with existing XML syntax textarea/highlighting.

- Add persistence:
  - Store imported WSDL metadata and recent SOAP calls in profile storage.
  - Suggested files:
    - `soap-client/wsdls.json`
    - `soap-client/recent-history.json`
  - Restored SOAP tabs should reopen as SOAP Client tabs, not empty editor tabs.

## Public Interfaces / Internal APIs
- New module: `registerMarkdownViewerSoapClient(app, deps)`
  - `mountSoapClientTab(tab, root)`
  - `activateSoapClientSidebar(tab?)`
  - `deactivateSoapClientSidebar()`
  - `openSoapClientTab(operationSnapshot?)`
  - `importWsdlFromUrl(url)`
  - `importWsdlFromText(source, sourceLabel)`

- New parser module:
  - `parseWsdl(source, sourceLabel)`
  - Returns normalized WSDL document:
    - `id`
    - `name`
    - `targetNamespace`
    - `services[]`
    - `bindings[]`
    - `operations[]`
    - `diagnostics[]`

- New request builder module:
  - `createSoapEnvelope(operation, options)`
  - `createSoapHttpRequest(tabState, requestSettings)`

## Test Plan
- Unit tests:
  - Parse WSDL 1.1 with one service, one port, one operation.
  - Parse multiple services/ports/operations.
  - Extract SOAP 1.1 endpoint and SOAPAction.
  - Extract SOAP 1.2 endpoint/action.
  - Generate SOAP envelope with namespace declarations.
  - Generate fallback envelope when schema/message resolution is incomplete.
  - Build correct HTTP headers for SOAP 1.1 and SOAP 1.2.

- UI smoke tests:
  - Rail icon appears and respects Railbar settings visibility.
  - Import WSDL URL populates sidebar tree.
  - Selecting operation opens SOAP tab.
  - SOAP tab restores after app restart.
  - Send request displays status and XML response.

- Regression checks:
  - `node --check` for changed/new JS files.
  - Existing API Client still opens and sends requests.
  - Existing rail icons and preferences still work.

## Assumptions
- V1 supports **WSDL 1.1** only. WSDL 2.0 is out of scope.
- V1 supports SOAP request generation and sending, not full SOAP debugging.
- WS-Security signing/encryption is out of scope for V1. Users can edit headers/envelope manually.
- Networking should reuse the existing API Client bridge; no new HTTP bridge should be added.
- SOAP Client is a railbar/sidebar tool, not just a Tools-menu tab.
