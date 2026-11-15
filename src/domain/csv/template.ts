import { CSV_COLUMNS } from './limits'

/**
 * The downloadable example: one row per lease, fictional names. It shows a suite with two leases (200: a past
 * tenant and a signed future one), empty suites (310, 420), a common lobby (100), an open-ended lease (320),
 * a tenant that is vacating (300), suites that can be combined (joins_next) and a quoted name with a comma.
 */
export const CSV_TEMPLATE = [
  CSV_COLUMNS.join(','),
  'Coral Way Plaza,4,400,6200,leasable,52,yes,Seagrape Analytics,2022-03-01,2029-02-28,49.50,no',
  'Coral Way Plaza,4,420,3600,leasable,52,no,,,,,',
  'Coral Way Plaza,3,300,4200,leasable,48,yes,Brightwater Dental Group,2020-06-01,2027-05-31,44,yes',
  'Coral Way Plaza,3,310,3900,leasable,48,yes,,,,,',
  'Coral Way Plaza,3,320,2600,leasable,46,no,"Kestrel & Pine, CPAs",2024-01-01,,45,no',
  'Coral Way Plaza,2,200,6100,leasable,47,no,Old Harbor Title Co.,2019-09-01,2026-08-31,41,no',
  'Coral Way Plaza,2,200,6100,leasable,47,no,Lumen Street Studio,2027-02-01,2032-01-31,47,no',
  'Coral Way Plaza,2,210,3400,leasable,46,no,Mangrove Travel,2023-05-01,2028-04-30,43,no',
  'Coral Way Plaza,1,100,1800,common,,no,,,,,',
  'Coral Way Plaza,1,110,3200,leasable,50,no,Palmetto Coffee Roasters,2021-11-01,2031-10-31,47,no',
].join('\n') + '\n'
