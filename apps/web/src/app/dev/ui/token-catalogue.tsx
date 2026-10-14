"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { designTokenGroups, SectionHeading, type DesignToken, type DesignTokenGroup } from "@albion/ui";
import styles from "./page.module.css";

function TokenPreview({ token, kind }: { token: DesignToken; kind: DesignTokenGroup["kind"] }) {
  const value = `var(${token.name})`;
  if (kind === "color") {
    return <div className={styles.swatch} style={{ backgroundColor: value }} aria-hidden="true" />;
  }
  if (kind === "type") {
    return <div className={styles.typeSample} style={{ fontSize: value }} aria-hidden="true">Aa</div>;
  }
  if (kind === "space") {
    return <div className={styles.spaceTrack} aria-hidden="true"><span style={{ inlineSize: value }} /></div>;
  }
  const borderStyle: CSSProperties = { [token.borderProperty ?? "border"]: value };
  if (token.borderProperty === "borderRadius") borderStyle.blockSize = "var(--size-64)";
  return <div className={styles.borderTrack} aria-hidden="true"><span style={borderStyle} /></div>;
}

export function TokenCatalogue() {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const applied = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries(designTokenGroups.flatMap((group) =>
      group.tokens.map((token) => [token.name, applied.getPropertyValue(token.name).trim()]),
    )));
  }, []);

  return (
    <>
      <nav className={styles.navigation} aria-label="Token categories">
        {designTokenGroups.map((group) => <a key={group.id} href={`#${group.id}`}>{group.label}</a>)}
        <a href="#examples">Component examples</a>
      </nav>
      {designTokenGroups.map((group) => (
        <section className={styles.section} id={group.id} key={group.id} aria-labelledby={`${group.id}-heading`}>
          <div id={`${group.id}-heading`}><SectionHeading title={group.label} description={group.description} /></div>
          {group.kind === "foundation" ? (
            <dl className={styles.foundations}>
              {group.tokens.map((token) => (
                <div key={token.name}>
                  <dt><code>{token.name}</code></dt>
                  <dd><code>{values[token.name] || "Value available after page loads"}</code></dd>
                </div>
              ))}
            </dl>
          ) : (
            <ul className={styles.grid}>
              {group.tokens.map((token) => (
                <li className={styles.card} key={token.name}>
                  <TokenPreview token={token} kind={group.kind} />
                  <strong>{token.label}</strong>
                  <code>{token.name}</code>
                  <code className={styles.value}>{values[token.name] || "Value available after page loads"}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
