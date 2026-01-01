import { ynabUtils } from '@/app/lib/ynabApiClient';
import { YnabApiTransaction } from '@/app/types';

describe('ynabUtils.flattenTransactions', () => {
  const baseTransaction: YnabApiTransaction = {
    id: 'txn-1',
    date: '2024-01-01',
    amount: -5000,
    memo: 'Parent memo',
    cleared: 'cleared',
    approved: true,
    account_id: 'acct-1',
    account_name: 'Checking',
    payee_id: 'payee-1',
    payee_name: 'Grocer',
    category_id: undefined,
    category_name: undefined,
    transfer_account_id: undefined,
    transfer_transaction_id: undefined,
    matched_transaction_id: undefined,
    import_id: 'import-1',
    import_payee_name: undefined,
    import_payee_name_original: undefined,
    debt_transaction_type: undefined,
    deleted: false,
    subtransactions: [
      {
        id: 'sub-1',
        transaction_id: 'txn-1',
        amount: -2000,
        memo: null,
        payee_id: null,
        payee_name: null,
        category_id: 'cat-1',
        category_name: 'Groceries',
        transfer_account_id: null,
        transfer_transaction_id: null,
        deleted: false
      },
      {
        id: 'sub-2',
        transaction_id: 'txn-1',
        amount: -3000,
        memo: 'Specific memo',
        payee_id: 'payee-2',
        payee_name: 'Bakery',
        category_id: 'cat-2',
        category_name: 'Treats',
        transfer_account_id: null,
        transfer_transaction_id: null,
        deleted: false
      }
    ]
  };

  it('returns one entry per sub-transaction with inherited metadata', () => {
    const flattened = ynabUtils.flattenTransactions([baseTransaction]);

    expect(flattened).toHaveLength(2);
    const [first, second] = flattened;

    expect(first.id).toBe('sub-1');
    expect(first.amount).toBe(-2000);
    expect(first.memo).toBe('Parent memo');
    expect(first.payee_name).toBe('Grocer');
    expect(first.category_id).toBe('cat-1');
    expect(first.parent_transaction_id).toBe('txn-1');
    expect(first.subtransaction_index).toBe(0);

    expect(second.id).toBe('sub-2');
    expect(second.amount).toBe(-3000);
    expect(second.memo).toBe('Specific memo');
    expect(second.payee_name).toBe('Bakery');
    expect(second.category_id).toBe('cat-2');
    expect(second.parent_transaction_id).toBe('txn-1');
    expect(second.subtransaction_index).toBe(1);
  });

  it('creates unique hashes for different sub-transactions', () => {
    const flattened = ynabUtils.flattenTransactions([baseTransaction]);
    const hashes = flattened.map(ynabUtils.generateTransactionHash);

    expect(new Set(hashes).size).toBe(flattened.length);
  });
});
