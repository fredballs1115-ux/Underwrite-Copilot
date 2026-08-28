/**
 * Fixture rent rolls — the four shapes the parser has to survive.
 *
 * `MESSY` is the important one: a three-line title block above the header,
 * broker-idiosyncratic column names, a monthly rent column, mixed date
 * formats, a totals row at the bottom, and a blank spacer row in the middle.
 */

export const CLEAN_CSV = `Suite,Tenant,Rentable SF,Lease Start,Lease Expiration,Annual Rent,Lease Type
100,Ardent Logistics,40000,2021-01-01,2027-12-31,480000,NNN
110,Copperline Foods,25000,2022-06-01,2026-06-30,325000,NNN
120,VACANT,15000,,,,
200,Marrow Design Co,20000,2020-03-01,2029-02-28,300000,NNN
`;

export const MESSY_CSV = `RENT ROLL,,,,,,
Northgate Commerce Center,,,,,,
As of 3/31/2026,,,,,,
,,,,,,
Ste #,Tenant Name,Sq Ft,Commencement,Exp Date,Monthly Rent,Escalations,Type
"101","Bellweather Print, Inc.","12,500",1/1/2023,12/31/2027,"$18,750.00",3.0%,NNN
"102",Vacant,"4,800",,,,,
,,,,,,,
"103",Harbor & Vine LLC,"9,200",15-Mar-2021,31-Dec-2026,"$13,800.00",2.5%,MG
"104",Sightline Optics,"6,400",Jan-2024,Jan-2029,"$10,240.00",3.0%,NNN
TOTAL,,"32,900",,,"$42,790.00",,
`;

/** Expiries missing on occupied space, and a rent that's an order of magnitude
 *  off (a monthly figure left in an annual column). */
export const MISSING_EXPIRIES_CSV = `Unit,Tenant,SF,Expiry,Annual Rent
1,Aster Legal,5000,,90000
2,Bramble Cafe,1200,2028-05-31,42000
3,Cinder Works,3000,2027-09-30,4500
4,,2000,,
`;

/** 40 tenants, staggered expiries — the "rollover schedule IS the deal" case. */
export function fortyTenantCsv(): string {
  const rows = [`Suite,Tenant,Rentable SF,Lease Expiration,Annual Rent,Lease Type`];
  for (let i = 1; i <= 40; i++) {
    const sf = 2000 + (i % 7) * 500;
    const year = 2026 + (i % 6);
    const month = String(((i * 3) % 12) + 1).padStart(2, "0");
    const rent = sf * (18 + (i % 5));
    rows.push(`${100 + i},Tenant ${String(i).padStart(2, "0")},${sf},${year}-${month}-28,${rent},NNN`);
  }
  return `${rows.join("\n")}\n`;
}
