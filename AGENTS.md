# Project Rules & Guidelines

## 1. Automated Deployment Webhook (Easypanel)
Setiap kali melakukan `git push` ke GitHub, kamu **WAJIB** langsung memanggil webhook deploy Easypanel berikut agar deployment otomatis berjalan:

```bash
curl -X POST http://217.217.255.58:3000/api/deploy/554a2f63340cb1563307fad1a0d79520c846cf0d9cd4b110
```

Di PowerShell:
```powershell
curl.exe -X POST "http://217.217.255.58:3000/api/deploy/554a2f63340cb1563307fad1a0d79520c846cf0d9cd4b110"
```

Pastikan membaca respons dari webhook tersebut untuk memverifikasi proses build/deploy telah berhasil dipicu.

## 2. Keamanan & Kredensial
- Jangan pernah meng-commit kredensial, file `.env`, file private key, atau folder `porto_prompt/`.
- Seluruh data persisten produksi (DB, uploads, static build) disimpan di volume `/data`.
