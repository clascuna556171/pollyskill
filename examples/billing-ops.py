"""
Stripe & Internal Billing Automation Operations CLI
Static extraction target for PolySkill compiler.
"""
import argparse

def refund_charge(charge_id: str, amount_cents: int, reason: str = "customer_request") -> dict:
    """
    Issue a full or partial refund for a customer payment charge.
    :param charge_id: Target charge identifier (ch_xxx)
    :param amount_cents: Amount to refund in cents
    :param reason: Reason code (customer_request, duplicate, fraudulent)
    """
    print(f"Refunding charge {charge_id} with amount {amount_cents} cents. Reason: {reason}")
    return {"refund_id": "re_mock_123", "status": "succeeded"}

def cancel_subscription(subscription_id: str, immediately: bool = False) -> bool:
    """
    Cancel an active recurring customer subscription.
    :param subscription_id: Target subscription identifier (sub_xxx)
    :param immediately: If True, cancel right away instead of end-of-period
    """
    print(f"Canceling subscription {subscription_id} (immediate={immediately})")
    return True

def fetch_customer_invoices(customer_id: str, limit: int = 10) -> list:
    """
    Retrieve recent billing invoices for a specific account.
    :param customer_id: Customer ID (cus_xxx)
    :param limit: Maximum number of invoice records to return
    """
    return [{"id": "in_1001", "amount_due": 4500, "status": "paid"}]

def purge_customer_payment_methods(customer_id: str) -> bool:
    """
    Permanently detach and delete stored credit cards for a customer.
    :param customer_id: Target customer ID
    """
    print(f"Purging payment methods for {customer_id}")
    return True
