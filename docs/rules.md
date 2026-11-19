# Rules methodology and sources

This page explains how Heirmap models intestate succession and lists, for every rule version, the
authorities it relies on and the questions still open. Corrections are welcome; please use the
**Rule correction** issue template and cite your source.

## Principles

1. **Situs governs land.** Real property passes under the intestacy law of the state where it is
   located (Restatement (Second) of Conflict of Laws § 236). The property's state therefore selects
   the rules module, whatever state the decedent lived in.
2. **The date of death selects the version.** Rights of inheritance vest at death. Each death is
   decided by the version with the latest `effectiveFrom` on or before that date. A death earlier
   than the earliest modeled version uses the earliest one and raises a `RULES_PREDATE` warning.
3. **Exact arithmetic, full provenance.** Shares are reduced `bigint` fractions. Each transfer
   records the rule version, the citations, a quotation where available and an explanation.
4. **No silent guesses.** Unknown facts produce _unresolved_ shares. Unsettled law produces
   `RULE_NEEDS_REVIEW` warnings. Neither is hidden.
5. **Confidence is explicit.** `high` means checked against statute text. `medium` means the
   structure is confirmed but some wording comes from secondary sources. `low` means modeled from
   case law and commentary.

## Cross-cutting rules

| Topic        | How Heirmap handles it                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Survival     | A version sets `survival.hours`. With 120 hours, a gap of 4 days or less means the heir is treated as predeceased; exactly 5 days is treated as surviving with a "borderline" warning; 6 days or more is survival. With 0 (the original Uniform Simultaneous Death Act), same-day deaths are treated as each predeceasing the other.                                                                                                        |
| Not yet born | A relative born more than 300 days after the death is not an heir; one born within 300 days is treated as a posthumous heir, with a notice.                                                                                                                                                                                                                                                                                                 |
| Spouse       | A marriage counts if it started on or before the death and did not end by divorce or annulment before it. Common-law marriages count only if formed before the state's cutoff (Georgia 1997-01-01, Mississippi after 1956-04-05, Alabama 2017-01-01, South Carolina after 2019-07-24 under _Stone v. Thompson_, North Carolina never).                                                                                                      |
| Children     | Biological and adopted children inherit. Stepchildren and foster children do not (South Carolina 1987–2013 is the exception, as a last resort). A child adopted by another family is cut off from the birth parent. A child of unmarried parents inherits from the father if paternity is established. Unknown paternity is included with a warning; "not established" excludes the child. Older Mississippi versions require legitimation. |
| Exclusions   | Disclaimers, slayers and other exclusions are treated as if the person predeceased.                                                                                                                                                                                                                                                                                                                                                         |
| Wills        | A probated will's devises take priority, and any undisposed remainder passes by intestacy. A devise to someone who did not survive lapses, with a warning about anti-lapse statutes. An unprobated will is ignored, with a warning.                                                                                                                                                                                                         |
| Co-owners    | Tenants in common each pass their own share. With right of survivorship, each owner's share accrues to the survivors until one remains.                                                                                                                                                                                                                                                                                                     |

## Alabama

| Version   | Deaths                   | Authorities                                                                                                       | Confidence |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| `AL-1900` | before 1980-05-28        | Code 1940 Tit. 16 § 1; Ala. Code 1975 § 43-3-1                                                                    | low        |
| `AL-1980` | 1980-05-28 to 1982-12-31 | § 43-3-1 as amended; _Ransom v. Ransom_, 401 So. 2d 746 (Ala. 1981); _Morgan v. Tate_, 445 So. 2d 273 (Ala. 1984) | low        |
| `AL-1983` | from 1983-01-01          | Ala. Code §§ 43-8-40 to -48 (Acts 1982, No. 82-399)                                                               | medium     |

Open questions: the exact collateral order (places two through five) of former § 43-3-1; the
ancestral-property half-blood rule (_Caffee v. Thompson_, 1955); whether § 43-8-48 was amended after
the 2008 Parentage Act. Dower and homestead (before 1983) are life estates and are not shown as fee
shares. The five-day survival rule's escheat exception is not modeled.

## Georgia

| Version   | Deaths                   | Authorities                                                           | Confidence |
| --------- | ------------------------ | --------------------------------------------------------------------- | ---------- |
| `GA-1900` | before 1985-07-01        | Civil Code 1910 § 3931; Code 1933 § 113-903; O.C.G.A. § 53-4-2 (1982) | medium     |
| `GA-1985` | 1985-07-01 to 1997-12-31 | O.C.G.A. § 53-4-2 as amended by Ga. L. 1985, p. 1257                  | medium     |
| `GA-1998` | from 1998-01-01          | O.C.G.A. § 53-1-1(b); § 53-2-1; § 53-10-2                             | medium     |

Open questions: the text of former § 53-4-3 (a husband inheriting from his wife before 1985); the
1931 half-blood amendment; when grandparents were added to the old statute (between 1970 and 1982);
whether current "per stirpes" starts at the children's generation when all children have died
(Heirmap follows the text and uses classic per stirpes). Not modeled: dower (abolished 1969, flagged
for deaths before 1970), year's support and abandonment.

## Mississippi

| Version   | Deaths                   | Authorities                                                 | Confidence |
| --------- | ------------------------ | ----------------------------------------------------------- | ---------- |
| `MS-1900` | before 1956-07-01        | Miss. Code §§ 91-1-3, 91-1-5, 91-1-7 (Code 1942 §§ 468–470) | medium     |
| `MS-1956` | 1956-07-01 to 1981-06-30 | as above, plus § 91-3-5 (Uniform Simultaneous Death Law)    | high       |
| `MS-1981` | from 1981-07-01          | as above, plus § 91-1-15 (nonmarital children)              | high       |

The statute text was read verbatim from the annotated code (2022 release). Open questions: what Laws
1952, ch. 252 changed in § 91-1-3 (flagged for deaths before 1953); and a surviving parent sharing
with half-blood siblings (compare _Aycock v. Aycock_, 1919). The homestead rule of § 91-1-19 is noted
but not modeled separately.

## North Carolina

| Version   | Deaths                   | Authorities                                               | Confidence |
| --------- | ------------------------ | --------------------------------------------------------- | ---------- |
| `NC-1960` | 1960-07-01 to 2007-09-30 | N.C. Gen. Stat. §§ 29-3, 29-7, 29-12, 29-14, 29-15, 29-16 | medium     |
| `NC-2007` | from 2007-10-01          | as above, plus § 28A-24-2 (120 hours; S.L. 2007-132)      | medium     |

Only the spouse's share of **real property** is modeled; the personal-property dollar amounts do not
affect land. Open questions: whether § 29-16 used per capita at each generation before the 1979
amendment. Deaths before 1960-07-01 (canons of descent, dower and curtesy) are not modeled. The
spouse's elective life estate (§ 29-30) is noted as a caveat.

## South Carolina

| Version   | Deaths                   | Authorities                                                                                                                                                         | Confidence |
| --------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `SC-1900` | before 1987-07-01        | S.C. Code 1976 § 21-3-20; Code 1962 § 19-52; _Pitts v. Hamrick_, 228 F.2d 486 (4th Cir. 1955); _Bynum v. Bynum_ (S.C. 1960); _Kinard v. Moore_, 220 S.C. 376 (1951) | low        |
| `SC-1987` | 1987-07-01 to 2013-12-31 | S.C. Code §§ 62-1-100, 62-2-102 to 62-2-109                                                                                                                         | medium     |
| `SC-2014` | from 2014-01-01          | as above, as revised by 2013 Act No. 100                                                                                                                            | medium     |

Open questions: the text of former § 21-3-20(4)–(10), the remote tiers, and the widow's share
against remote kin; whether the stepchildren step existed from 1987 or only after the 1990
amendments. Half-blood postponement under the old statute is flagged, not modeled. Dower (abolished
in the mid-1980s) is not shown.

## Adding sources

When you verify a version against the official statute text, update its `confidence`, replace
paraphrased quotes with exact text, and remove the corresponding note. Include the edition or year
you checked in the pull request description.
