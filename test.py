import requests

API_BASE = "https://backend-8npy.onrender.com"  # ⬅️ Change this if needed

# Your frontend route map
ROUTES = {
    "/auth/register": "POST",
    "/auth/login": "POST",
    "/auth/google-login": "POST",
    "/auth/login-token": "POST",
    "/auth/verify": "POST",
    "/auth/logout": "POST",
    "/auth/forgot-password": "POST",
    "/admin/auth/login": "POST",
    "/admin/auth/profile": "GET",
    "/admin/auth/verify": "GET",
    "/admin/auth/logout": "POST",
    "/admin/auth/refresh": "POST",
    "/products": "GET",
    "/products/sample-id": "GET",
    "/orders/create": "POST",
    "/orders/sample-id": "GET",
    "/orders/user": "GET",
    "/admin/orders/sample-id/status": "PATCH",
    "/payments/verify": "POST",
    "/coupons/apply": "POST",
    "/coupons/public": "GET",
    "/users/profile": "GET",
    "/users/addresses": "GET",
    "/admin/dashboard": "GET",
    "/admin/countdown-settings": "GET",
    "/health": "GET",
    "/admin/analytics": "GET",
    "/admin/signals": "GET",
}

print(f"🔎 Verifying {len(ROUTES)} routes against {API_BASE}...\n")

for route, method in ROUTES.items():
    url = API_BASE + route.replace("sample-id", "1234")
    try:
        response = requests.request(method, url, timeout=5)
        status = response.status_code
        if status == 200:
            print(f"✅ 200 OK: {method} {route}")
        elif status == 404:
            print(f"❌ 404 Not Found: {method} {route}")
        else:
            print(f"⚠️ {status}: {method} {route}")
    except Exception as e:
        print(f"🚫 Error on {method} {route}: {e}")