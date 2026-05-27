/**
 * Billing Client
 * Handles billing operations via REST API to Auth Service
 */

import { AccessTokenService } from '../libs/AccessTokenService/AccessTokenService';

// Billing types
export type Customer = {
  id: string;
  email?: string;
  name?: string;
  createdAt: number;
};

export type PaymentMethod = {
  id: string;
  type: 'CARD' | 'CRYPTO';
  provider?: string;
  cardBrand?: string;
  cardLast4?: string;
  cardExpMonth?: number;
  cardExpYear?: number;
  walletAddress?: string;
  blockchain?: string;
  isDefault: boolean;
  createdAt: number;
};

export type SubscriptionPlan = {
  id: string;
  name: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  basePricePerSeat: number;
  usageMarkup: number;
  features?: Record<string, unknown>;
};

export type Subscription = {
  id: string;
  status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE' | 'UNPAID' | 'TRIALING';
  plan: 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE';
  basePricePerSeat: number;
  usageMarkup: number;
  seats: number;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  cancelAt?: number;
  trialEnd?: number;
  createdAt: number;
};

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE';
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  periodStart?: number;
  periodEnd?: number;
  dueDate?: number;
  paidAt?: number;
  pdfUrl?: string;
  lineItems?: InvoiceLineItem[];
  createdAt: number;
};

export type Payment = {
  id: string;
  invoiceId?: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  provider?: string;
  txHash?: string;
  blockchain?: string;
  createdAt: number;
};

export type UsageMetric = {
  quantity: number;
  amount: number;
};

export type CurrentUsage = {
  storage: UsageMetric;
  bandwidth: UsageMetric;
  compute: UsageMetric;
  requests: UsageMetric;
  total: number;
  periodStart?: number;
  periodEnd?: number;
};

export type UsageRecord = {
  id: string;
  metricType: 'storage' | 'bandwidth' | 'compute' | 'requests';
  quantity: number;
  unitPrice: number;
  amount: number;
  periodStart: number;
  periodEnd: number;
  recordedAt: number;
  createdAt: number;
};

// Connect types
export type ConnectedAccount = {
  id: string;
  provider: 'stripe' | 'stax';
  accountType: 'standard' | 'express' | 'custom';
  email?: string;
  businessName?: string;
  country?: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  createdAt: number;
};

export type Transfer = {
  id: string;
  connectedAccountId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'canceled';
  description?: string;
  createdAt: number;
};

export type CryptoPaymentRequest = {
  id: string;
  status: 'PENDING';
  amount: number;
  currency: string;
  depositAddress: string;
  chainId: number;
  tokenAddress?: string;
  tokenSymbol: string;
  expiresAt: number;
};

type BillingClientOptions = {
  authServiceUrl: string;
  accessTokenService: AccessTokenService;
};

export class BillingClient {
  private authServiceUrl: string;
  private accessTokenService: AccessTokenService;

  constructor(options: BillingClientOptions) {
    this.authServiceUrl = options.authServiceUrl.replace(/\/$/, '');
    this.accessTokenService = options.accessTokenService;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const accessToken = await this.accessTokenService.getAccessToken();

    const response = await fetch(`${this.authServiceUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============================================
  // Customer
  // ============================================

  public getCustomer = async (): Promise<Customer | null> => {
    const response = await this.fetch<{ customer: Customer }>('/billing/customer');
    return response.customer;
  };

  public updateCustomer = async (data: { email?: string; name?: string }): Promise<Customer> => {
    const response = await this.fetch<{ customer: Customer }>('/billing/customer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.customer;
  };

  // ============================================
  // Payment Methods
  // ============================================

  public listPaymentMethods = async (): Promise<PaymentMethod[]> => {
    const response = await this.fetch<{ paymentMethods: PaymentMethod[] }>('/billing/payment-methods');
    return response.paymentMethods;
  };

  public addPaymentMethod = async (input: {
    paymentMethodId?: string;
    walletAddress?: string;
    blockchain?: string;
    provider?: 'stripe' | 'stax';
    setDefault?: boolean;
  }): Promise<PaymentMethod> => {
    if (input.walletAddress) {
      // Crypto wallet
      const response = await this.fetch<{ paymentMethod: PaymentMethod }>('/billing/payment-methods/crypto', {
        method: 'POST',
        body: JSON.stringify({
          walletAddress: input.walletAddress,
          blockchain: input.blockchain,
          setDefault: input.setDefault,
        }),
      });
      return response.paymentMethod;
    } else {
      // Card
      const response = await this.fetch<{ paymentMethod: PaymentMethod }>('/billing/payment-methods/card', {
        method: 'POST',
        body: JSON.stringify({
          paymentMethodId: input.paymentMethodId,
          provider: input.provider || 'stripe',
          setDefault: input.setDefault,
        }),
      });
      return response.paymentMethod;
    }
  };

  public removePaymentMethod = async ({ id }: { id: string }): Promise<boolean> => {
    await this.fetch<{ success: boolean }>(`/billing/payment-methods/${id}`, {
      method: 'DELETE',
    });
    return true;
  };

  public setDefaultPaymentMethod = async ({ id }: { id: string }): Promise<boolean> => {
    await this.fetch<{ success: boolean }>(`/billing/payment-methods/${id}/default`, {
      method: 'PUT',
    });
    return true;
  };

  // ============================================
  // Subscriptions
  // ============================================

  public listSubscriptions = async (): Promise<Subscription[]> => {
    const response = await this.fetch<{ subscriptions: Subscription[] }>('/billing/subscriptions');
    return response.subscriptions;
  };

  public getActiveSubscription = async (): Promise<Subscription | null> => {
    const response = await this.fetch<{ subscription: Subscription | null }>('/billing/subscriptions/active');
    return response.subscription;
  };

  public getSubscriptionPlans = async (): Promise<SubscriptionPlan[]> => {
    const response = await this.fetch<{ plans: SubscriptionPlan[] }>('/billing/subscriptions/plans');
    return response.plans;
  };

  public createSubscription = async (input: {
    planId: string;
    seats?: number;
    paymentMethodId?: string;
  }): Promise<Subscription> => {
    const response = await this.fetch<{ subscription: Subscription }>('/billing/subscriptions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.subscription;
  };

  public cancelSubscription = async ({
    id,
    immediately = false,
  }: {
    id: string;
    immediately?: boolean;
  }): Promise<Subscription> => {
    const response = await this.fetch<{ subscription: Subscription }>(`/billing/subscriptions/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ immediately }),
    });
    return response.subscription;
  };

  public updateSubscriptionSeats = async ({
    id,
    seats,
  }: {
    id: string;
    seats: number;
  }): Promise<Subscription> => {
    const response = await this.fetch<{ subscription: Subscription }>(`/billing/subscriptions/${id}/seats`, {
      method: 'PUT',
      body: JSON.stringify({ seats }),
    });
    return response.subscription;
  };

  // ============================================
  // Invoices
  // ============================================

  public listInvoices = async ({
    status,
    limit = 50,
  }: {
    status?: string;
    limit?: number;
  } = {}): Promise<Invoice[]> => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (limit) params.set('limit', limit.toString());

    const response = await this.fetch<{ invoices: Invoice[] }>(`/billing/invoices?${params}`);
    return response.invoices;
  };

  public getInvoice = async ({ id }: { id: string }): Promise<Invoice | null> => {
    const response = await this.fetch<{ invoice: Invoice }>(`/billing/invoices/${id}`);
    return response.invoice;
  };

  public generateInvoice = async (): Promise<Invoice> => {
    const response = await this.fetch<{ invoice: Invoice }>('/billing/invoices/generate', {
      method: 'POST',
    });
    return response.invoice;
  };

  // ============================================
  // Usage
  // ============================================

  public getCurrentUsage = async (): Promise<CurrentUsage | null> => {
    const response = await this.fetch<{ usage: CurrentUsage }>('/billing/usage/current');
    return response.usage;
  };

  public getUsageHistory = async (limit = 100): Promise<UsageRecord[]> => {
    const response = await this.fetch<{ records: UsageRecord[] }>(`/billing/usage/history?limit=${limit}`);
    return response.records;
  };

  public recordUsage = async (input: {
    metricType: 'storage' | 'bandwidth' | 'compute' | 'requests';
    quantity: number;
    timestamp?: number;
  }): Promise<UsageRecord> => {
    const response = await this.fetch<{ record: UsageRecord }>('/billing/usage/record', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.record;
  };

  // ============================================
  // Payments
  // ============================================

  public listPayments = async (limit = 50): Promise<Payment[]> => {
    const response = await this.fetch<{ payments: Payment[] }>(`/billing/payments?limit=${limit}`);
    return response.payments;
  };

  public processPayment = async ({
    invoiceId,
    paymentMethodId,
    amount,
  }: {
    invoiceId: string;
    paymentMethodId?: string;
    amount?: number;
  }): Promise<Payment & { clientSecret?: string }> => {
    const response = await this.fetch<{ payment: Payment; clientSecret?: string }>('/billing/payments', {
      method: 'POST',
      body: JSON.stringify({ invoiceId, paymentMethodId, amount }),
    });
    const result: Payment & { clientSecret?: string } = { ...response.payment };
    if (response.clientSecret) {
      result.clientSecret = response.clientSecret;
    }
    return result;
  };

  public createCryptoPayment = async ({
    invoiceId,
    chainId = 1,
    tokenSymbol = 'usdc',
  }: {
    invoiceId: string;
    chainId?: number;
    tokenSymbol?: string;
  }): Promise<CryptoPaymentRequest> => {
    const response = await this.fetch<{ payment: CryptoPaymentRequest }>('/billing/payments/crypto/create', {
      method: 'POST',
      body: JSON.stringify({ invoiceId, chainId, tokenSymbol }),
    });
    return response.payment;
  };

  public recordCryptoPayment = async (input: {
    invoiceId: string;
    txHash: string;
    blockchain: string;
    fromAddress: string;
    amount: number;
  }): Promise<Payment> => {
    const response = await this.fetch<{ payment: Payment }>('/billing/payments/crypto/record', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.payment;
  };

  // ============================================
  // Connect (Marketplace/Platform)
  // ============================================

  public listConnectedAccounts = async (): Promise<ConnectedAccount[]> => {
    const response = await this.fetch<{ accounts: ConnectedAccount[] }>('/billing/connect/accounts');
    return response.accounts;
  };

  public createConnectedAccount = async (input: {
    provider?: 'stripe' | 'stax';
    email: string;
    businessName?: string;
    country?: string;
    accountType?: 'standard' | 'express' | 'custom';
  }): Promise<ConnectedAccount> => {
    const response = await this.fetch<{ account: ConnectedAccount }>('/billing/connect/accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.account;
  };

  public getConnectedAccount = async (id: string): Promise<ConnectedAccount | null> => {
    const response = await this.fetch<{ account: ConnectedAccount }>(`/billing/connect/accounts/${id}`);
    return response.account;
  };

  public createOnboardingLink = async ({
    accountId,
    returnUrl,
    refreshUrl,
  }: {
    accountId: string;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{ url: string; expiresAt: number }> => {
    const response = await this.fetch<{ url: string; expiresAt: number }>(
      `/billing/connect/accounts/${accountId}/onboarding-link`,
      {
        method: 'POST',
        body: JSON.stringify({ returnUrl, refreshUrl }),
      }
    );
    return response;
  };

  public createDashboardLink = async (accountId: string): Promise<{ url: string }> => {
    const response = await this.fetch<{ url: string }>(`/billing/connect/accounts/${accountId}/dashboard-link`, {
      method: 'POST',
    });
    return response;
  };

  public deleteConnectedAccount = async (id: string): Promise<boolean> => {
    await this.fetch<{ success: boolean }>(`/billing/connect/accounts/${id}`, {
      method: 'DELETE',
    });
    return true;
  };

  public listTransfers = async (connectedAccountId?: string, limit = 50): Promise<Transfer[]> => {
    const params = new URLSearchParams();
    if (connectedAccountId) params.set('connectedAccountId', connectedAccountId);
    if (limit) params.set('limit', limit.toString());

    const response = await this.fetch<{ transfers: Transfer[] }>(`/billing/connect/transfers?${params}`);
    return response.transfers;
  };

  public createTransfer = async (input: {
    connectedAccountId: string;
    amount: number;
    currency?: string;
    description?: string;
    sourcePaymentId?: string;
  }): Promise<Transfer> => {
    const response = await this.fetch<{ transfer: Transfer }>('/billing/connect/transfers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return response.transfer;
  };

  public getPlatformBalance = async (): Promise<Array<{ available: number; pending: number; currency: string }>> => {
    const response = await this.fetch<{ balances: Array<{ available: number; pending: number; currency: string }> }>(
      '/billing/connect/balance'
    );
    return response.balances;
  };
}
