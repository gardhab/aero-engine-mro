import type { Ontology, OntologyClass } from "../types.js";

const PREFIX = `@prefix mro: <https://replit.app/ontology/engine-mro#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`;

function esc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function xsdType(attrType: string): string {
  switch (attrType) {
    case "integer":
      return "xsd:integer";
    case "number":
      return "xsd:decimal";
    case "boolean":
      return "xsd:boolean";
    default:
      return "xsd:string";
  }
}

/**
 * Serialize an ontology document to Turtle / OWL. This is the human- and
 * git-friendly canonical representation. The in-app JSON model is authoritative;
 * this serializer regenerates the .ttl on demand and on publish.
 */
export function serializeToTurtle(ontology: Ontology): string {
  const lines: string[] = [PREFIX, ""];
  lines.push(
    `mro:Ontology a owl:Ontology ;`,
    `    owl:versionInfo "${esc(ontology.version)}" ;`,
    `    rdfs:comment "Aircraft-engine MRO decision-support ontology (${esc(
      ontology.status,
    )})" .`,
    "",
  );

  for (const cls of ontology.classes) {
    lines.push(`mro:${cls.id} a owl:Class ;`);
    lines.push(`    rdfs:label "${esc(cls.label)}" ;`);
    if (cls.parentClass) {
      lines.push(`    rdfs:subClassOf mro:${cls.parentClass} ;`);
    }
    if (cls.deprecated) {
      lines.push(`    owl:deprecated true ;`);
    }
    lines.push(`    rdfs:comment "${esc(cls.description)}" .`);
    for (const attr of cls.attributes) {
      lines.push(
        `mro:${cls.id}_${attr.name} a owl:DatatypeProperty ;`,
        `    rdfs:domain mro:${cls.id} ;`,
        `    rdfs:range ${xsdType(attr.type)} ;`,
        `    rdfs:label "${esc(attr.name)}" .`,
      );
    }
    lines.push("");
  }

  for (const rel of ontology.relationships) {
    lines.push(`mro:${rel.id} a owl:ObjectProperty ;`);
    lines.push(`    rdfs:label "${esc(rel.label)}" ;`);
    lines.push(`    rdfs:domain mro:${rel.domain} ;`);
    lines.push(`    rdfs:range mro:${rel.range} ;`);
    lines.push(
      `    mro:sourceMultiplicity "${esc(rel.sourceMultiplicity)}" ;`,
      `    mro:targetMultiplicity "${esc(rel.targetMultiplicity)}" ;`,
    );
    if (rel.deprecated) {
      lines.push(`    owl:deprecated true ;`);
    }
    if (rel.description) {
      lines.push(`    rdfs:comment "${esc(rel.description)}" .`);
    } else {
      lines.push(`    rdfs:comment "" .`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function classById(
  ontology: Ontology,
  id: string,
): OntologyClass | undefined {
  return ontology.classes.find((c) => c.id === id);
}
