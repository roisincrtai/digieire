# Historical dashboard

The static dashboard opens at the year with the most dated OPW records within
the shared coverage (currently 2015). Its slider uses the overlap of the annual
wellbeing bins and the OPW catalogue's last dated year (currently 2010–2023).
National Analysis retains the complete discourse timeline to 2026.

## National wellbeing

`COMPUTE.buildSeries` runs on the full corpus with `period=1y`, `window=0`,
`location=all`, `weight_reactions=false`, `sensitivity=5`. Annual values are
means of discourse wellbeing values using the same full-corpus standardisation
as National Analysis. No new index or date-dependent standardisation is used.
2010 is partial (first discourse: 30 March); the interface states this.

## Spatial allocation (illustrative, not calibrated)

For county i and year t:

    weight_i,t = floods_i,t × density_i / sum_j(floods_j,t × density_j)
    allocated_wellbeing_i,t = national_wellbeing_t × weight_i,t

Weights sum to one, and the county allocations sum to the national
wellbeing index. The score is used directly, without inversion. This does not estimate local wellbeing,
flood probability, exposed population, or the causal effect of floods.
Higher allocations indicate a larger assigned share, not better local wellbeing.
The interface labels the layer as an illustrative allocation and explains the
rule. No recorded floods in a county yields zero allocation, not zero local wellbeing;
zero floods nationally or absent discourse yields unavailable allocation.

Population snapshot: CSO Census 2022 FY001, both sexes, 26 counties, sum 5,149,139.
Source: https://data.cso.ie/table/FY001
API: https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/FY001/JSON-stat/2.0/en
Downloaded 2026-09-07. The source URL and year accompany the snapshot in
`data/dashboard-population.js`. Density is population divided by the approximate
area of the bundled Irish National Grid boundary polygons, in km². It is held
fixed across years. Historic local-authority polygons and flood assignments are
aggregated into 26 counties (Dublin, Tipperary and city/county combinations).
This avoids combining 2022 local-authority populations with older city limits.
It remains an approximate county-level density, not a gridded population layer.

Flood data: the same `data/Irish_past_floods/floods_page.js` as Irish Floods.
Only year-dated records enter the timeline; recurring and undated records
are excluded. Incomplete reporting, approximate positions and derived county
assignments affect the map. The catalogue's last year does not establish
complete coverage. Northern Ireland has no data in this OPW layer.

The right-hand colour range is fixed to the maximum allocation across all
shared years, rounded up to 0.05. It is never rescaled per year.
Map values, summaries, legends and county details update from one year state.
