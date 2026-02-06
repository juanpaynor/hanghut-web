export const PHILIPPINE_BANKS = [
    { code: 'PH_BPI', name: 'Bank of the Philippine Islands (BPI)' },
    { code: 'PH_BDO', name: 'Banco De Oro Unibank, Inc. (BDO)' },
    { code: 'PH_UBP', name: 'Union Bank of the Philippines (UBP)' },
    { code: 'PH_GCASH', name: 'GCash' },
    { code: 'PH_PAYMAYA', name: 'Maya (PayMaya)' },
    { code: 'PH_RCBC', name: 'Rizal Commercial Banking Corporation (RCBC)' },
    { code: 'PH_SEC', name: 'Security Bank Corporation' },
    { code: 'PH_LBP', name: 'Land Bank of The Philippines' },
    { code: 'PH_MET', name: 'Metropolitan Bank and Trust Company (Metrobank)' },
    { code: 'PH_PNB', name: 'Philippine National Bank (PNB)' },
    { code: 'PH_PSB', name: 'Philippine Savings Bank (PSBank)' },
    { code: 'PH_EWB', name: 'East West Banking Corporation' },
    { code: 'PH_CBC', name: 'China Banking Corporation' },
    { code: 'PH_SB', name: 'Security Bank' },
    { code: 'PH_GRABPAY', name: 'GrabPay' },
    // Add more from list as needed, keeping top popular ones first
    { code: 'PH_AUB', name: 'Asia United Bank (AUB)' },
    { code: 'PH_BOC', name: 'Bank of Commerce' },
    { code: 'PH_CIMB', name: 'CIMB Bank Philippines' },
    { code: 'PH_GOTYME', name: 'GoTyme Bank' },
    { code: 'PH_SEABANK', name: 'Seabank Philippines Inc.' }, // Check code, user said PH_SEA
    { code: 'PH_SEA', name: 'Seabank Philippines Inc.' },
    { code: 'PH_COINS', name: 'Coins.PH' },
] as const

export type BankCode = typeof PHILIPPINE_BANKS[number]['code']
