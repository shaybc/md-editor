const assert = require("node:assert/strict");
const test = require("node:test");

const parser = require("../resources/js/tools/soap-client/wsdl-parser.js");
const builder = require("../resources/js/tools/soap-client/request-builder.js");

const wsdl11 = `<?xml version="1.0"?>
<definitions name="HelloService" targetNamespace="urn:test" xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:tns="urn:test" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/">
  <types>
    <xsd:schema targetNamespace="urn:test">
      <xsd:element name="SayHelloRequest">
        <xsd:complexType>
          <xsd:sequence>
            <xsd:element name="name" type="xsd:string"/>
            <xsd:element name="age" type="xsd:int"/>
          </xsd:sequence>
        </xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>
  <message name="SayHelloInput"><part name="parameters" element="tns:SayHelloRequest"/></message>
  <message name="SayHelloOutput"><part name="parameters" element="tns:SayHelloResponse"/></message>
  <portType name="HelloPortType">
    <operation name="SayHello">
      <input message="tns:SayHelloInput"/>
      <output message="tns:SayHelloOutput"/>
    </operation>
  </portType>
  <binding name="HelloBinding" type="tns:HelloPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="SayHello"><soap:operation soapAction="urn:test/SayHello"/></operation>
  </binding>
  <service name="HelloService">
    <port name="HelloPort" binding="tns:HelloBinding">
      <soap:address location="https://example.test/soap"/>
    </port>
  </service>
</definitions>`;

const wsdl12 = wsdl11
  .replace('xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"', 'xmlns:soap12="http://schemas.xmlsoap.org/wsdl/soap12/"')
  .replace(/soap:/g, "soap12:");

test("parses WSDL 1.1 service port operation and SOAPAction", () => {
  const document = parser.parseWsdl(wsdl11, "hello.wsdl");
  assert.equal(document.name, "HelloService");
  assert.equal(document.services[0].ports[0].operations[0].name, "SayHello");
  assert.equal(document.operations[0].endpointUrl, "https://example.test/soap");
  assert.equal(document.operations[0].soapAction, "urn:test/SayHello");
  assert.equal(document.operations[0].soapVersion, "1.1");
});

test("extracts SOAP 1.2 binding version", () => {
  const document = parser.parseWsdl(wsdl12, "hello12.wsdl");
  assert.equal(document.operations[0].soapVersion, "1.2");
});

test("generates SOAP envelope with namespace declarations and stub values", () => {
  const operation = parser.parseWsdl(wsdl11, "hello.wsdl").operations[0];
  const envelope = builder.createSoapEnvelope(operation);
  assert.match(envelope, /xmlns:soap="http:\/\/schemas\.xmlsoap\.org\/soap\/envelope\/"/);
  assert.match(envelope, /<m:SayHelloRequest xmlns:m="urn:test">/);
  assert.match(envelope, /<m:name>string<\/m:name>/);
  assert.match(envelope, /<m:age>0<\/m:age>/);
});

test("generates fallback envelope when schema details are incomplete", () => {
  const envelope = builder.createSoapEnvelope({ name: "Ping", targetNamespace: "urn:test" });
  assert.match(envelope, /<m:Ping xmlns:m="urn:test">/);
  assert.match(envelope, /Add request values here/);
});

test("builds SOAP HTTP headers for SOAP 1.1 and SOAP 1.2", () => {
  const soap11 = builder.createSoapHttpRequest({ endpointUrl: "https://example.test/soap", soapVersion: "1.1", soapAction: "urn:test", requestXml: "<x/>" }, { timeoutMs: 1000 });
  assert.equal(soap11.method, "POST");
  assert.equal(soap11.headers["Content-Type"], "text/xml; charset=utf-8");
  assert.equal(soap11.headers.SOAPAction, '"urn:test"');
  assert.equal(soap11.requestSettings.responseRenderMode, "xml");

  const soap12 = builder.createSoapHttpRequest({ endpointUrl: "https://example.test/soap", soapVersion: "1.2", soapAction: "urn:test", requestXml: "<x/>" }, {});
  assert.equal(soap12.headers["Content-Type"], 'application/soap+xml; charset=utf-8; action="urn:test"');
});
