const fs = require('fs');
const f = 'src/pages/reports/financial-statements/FinancialStatementsPage.tsx';
let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (!s.includes(a)) { console.log('MISS:', a.slice(0, 70)); return; } s = s.split(a).join(b); };
rep(`          onAccountChange={(nextAccountId) => {
            setAccountId(nextAccountId);
            setLedger(nextAccountId ? service.getGeneralLedger(nextAccountId, from, to) : null);
          }}`,
`          onAccountChange={async (nextAccountId) => {
            setAccountId(nextAccountId);
            setLedger(nextAccountId ? await service.getGeneralLedger(nextAccountId, from, to) : null);
          }}`);
rep(`  const loadLedger = useCallback(() => {
    const list = accounts.length ? accounts : service.getAccountsForLedger();
    if (!accounts.length) setAccounts(list);
    const selected = accountId || list[0]?.id || '';
    if (!selected) return;
    if (!accountId) setAccountId(selected);
    setLedger(service.getGeneralLedger(selected, from, to));
  }, [accountId, accounts, from, service, to]);`,
`  const loadLedger = useCallback(async () => {
    const list = accounts.length ? accounts : await service.getAccountsForLedger();
    if (!accounts.length) setAccounts(list);
    const selected = accountId || list[0]?.id || '';
    if (!selected) return;
    if (!accountId) setAccountId(selected);
    setLedger(await service.getGeneralLedger(selected, from, to));
  }, [accountId, accounts, from, service, to]);`);
rep(`  const load = useCallback(() => {
    setLoading(true);
    try {`,
`  const load = useCallback(async () => {
    setLoading(true);
    try {`);
rep(`          setIncome(accounting.getProfitAndLossReport(from, to));`,
`          setIncome(await accounting.getProfitAndLossReport(from, to));`);
rep(`          setBalance(service.getBalanceSheet(asOf));`,
`          setBalance(await service.getBalanceSheet(asOf));`);
rep(`          setCash(service.getCashFlow(from, to));`,
`          setCash(await service.getCashFlow(from, to));`);
rep(`          setAging(agingType === 'customer' ? service.getCustomerAging(asOf) : service.getSupplierAging(asOf));`,
`          setAging(agingType === 'customer' ? await service.getCustomerAging(asOf) : await service.getSupplierAging(asOf));`);
rep(`          setReconciliation(service.getReconciliation());`,
`          setReconciliation(await service.getReconciliation());`);
rep(`          const list = service.getSubledgerParties(partyType);`,
`          const list = await service.getSubledgerParties(partyType);`);
rep(`          setPartyStatement(selected ? service.getPartyStatement(partyType, selected, from, to) : null);`,
`          setPartyStatement(selected ? await service.getPartyStatement(partyType, selected, from, to) : null);`);
rep(`  const changeParty = (nextPartyId: string) => {
    setPartyId(nextPartyId);
    try {
      setPartyStatement(nextPartyId ? service.getPartyStatement(partyType, nextPartyId, from, to) : null);
    } catch (e: any) {`,
`  const changeParty = async (nextPartyId: string) => {
    setPartyId(nextPartyId);
    try {
      setPartyStatement(nextPartyId ? await service.getPartyStatement(partyType, nextPartyId, from, to) : null);
    } catch (e: any) {`);
fs.writeFileSync(f, s);
console.log('done');
