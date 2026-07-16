// Published XSD contracts for the Spec 2000 Ch.4 exchange. These are the formal
// schemas systems agree on; the runtime validators in tsr.ts / acknowledgement.ts
// enforce the same required elements and types (a full XSD validator is not
// bundled, so validation is performed structurally against these contracts).

export const ENGINE_SERVICE_REQUEST_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="EngineServiceRequest">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="Header">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="DocumentID" type="xs:string"/>
              <xs:element name="TransmissionDate" type="xs:dateTime"/>
              <xs:element name="Originator" type="xs:string"/>
              <xs:element name="Recipient" type="xs:string"/>
              <xs:element name="ContractType" type="xs:string"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
        <xs:element name="AssetDetails">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="EngineModel" type="xs:string"/>
              <xs:element name="ESN" type="xs:string"/>
              <xs:element name="FlightHours" type="xs:decimal"/>
              <xs:element name="FlightCycles" type="xs:integer"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
        <xs:element name="WorkScope">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="PrimaryReason" type="xs:string"/>
              <xs:element name="TargetTAT" type="xs:integer"/>
              <xs:element name="Directives">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="Directive" maxOccurs="unbounded">
                      <xs:complexType>
                        <xs:sequence>
                          <xs:element name="Module" type="xs:string"/>
                          <xs:element name="ActionRequired" type="xs:string"/>
                        </xs:sequence>
                      </xs:complexType>
                    </xs:element>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
              <xs:element name="ComplianceDirectives" minOccurs="0">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="ComplianceDirective" maxOccurs="unbounded" minOccurs="0">
                      <xs:complexType>
                        <xs:sequence>
                          <xs:element name="Reference" type="xs:string"/>
                          <xs:element name="Category" type="xs:string"/>
                          <xs:element name="Description" type="xs:string"/>
                        </xs:sequence>
                      </xs:complexType>
                    </xs:element>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
              <xs:element name="MaterialPolicy" minOccurs="0">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="PartsSupply" type="xs:string"/>
                    <xs:element name="MaterialClass" type="xs:string"/>
                    <xs:element name="ScrapPolicy" type="xs:string" minOccurs="0"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

export const INDUCTION_ACCEPTANCE_XSD = `<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="InductionAcceptance">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="DocumentID" type="xs:string"/>
        <xs:element name="AssociatedRequestID" type="xs:string"/>
        <xs:element name="IssueDate" type="xs:dateTime"/>
        <xs:element name="InductionStatus" type="xs:string"/>
        <xs:element name="Logistics">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="ShopOrder" type="xs:string" minOccurs="0"/>
              <xs:element name="BayAllocation" type="xs:string" minOccurs="0"/>
              <xs:element name="UncratingDate" type="xs:dateTime" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
        <xs:element name="TargetTAT" type="xs:integer"/>
        <xs:element name="CommittedTAT" type="xs:integer"/>
        <xs:element name="CommittedReleaseDate" type="xs:dateTime" minOccurs="0"/>
        <xs:element name="Feasibility" minOccurs="0">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="Item" maxOccurs="unbounded" minOccurs="0">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="Reference" type="xs:string"/>
                    <xs:element name="Feasible" type="xs:boolean"/>
                    <xs:element name="Note" type="xs:string" minOccurs="0"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
        <xs:element name="UnscheduledCostCapUSD" type="xs:decimal" minOccurs="0"/>
        <xs:element name="Signature" type="xs:string" minOccurs="0"/>
        <xs:element name="SignedAt" type="xs:dateTime" minOccurs="0"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>`;
