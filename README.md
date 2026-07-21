# E-RAMP OTBAN X

Website digital Ramp Inspection Checklist untuk Kantor Otoritas Bandar Udara Wilayah X Merauke.

## Versi publik

Website dideploy otomatis melalui GitHub Pages dari branch `main`.

## Database dan autentikasi daring

Website sudah mendukung Supabase. Agar login, database, dan unggah foto benar-benar aktif:

1. Buat proyek Supabase.
2. Jalankan skema database yang tersedia pada folder `supabase`.
3. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` pada bagian konfigurasi di `index.html`.
4. Tambahkan URL GitHub Pages ke daftar Redirect URLs pada Supabase Auth.

Jangan pernah memasukkan `service_role key` ke frontend.

> Prototype ini tidak menggantikan formulir resmi sebelum memperoleh persetujuan unit berwenang.
