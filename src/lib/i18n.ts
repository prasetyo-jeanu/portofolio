import type { Locale } from '../db/schema';

export const SUPPORTED_LOCALES: readonly Locale[] = ['id', 'en'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

export interface NavLabels {
  home: string;
  about: string;
  projects: string;
  blog: string;
  contact: string;
  search: string;
}

export const UI_TRANSLATIONS = {
  id: {
    localeName: 'Indonesia',
    shortCode: 'ID',
    nav: {
      home: 'Beranda',
      about: 'Tentang',
      projects: 'Proyek',
      blog: 'Blog',
      contact: 'Kontak',
      search: 'Cari',
    },
    skipToContent: 'Langsung ke konten utama',
    themeToggle: 'Ubah tema',
    lightMode: 'Mode terang',
    darkMode: 'Mode gelap',
    languageLabel: 'Pilih bahasa',
    hero: {
      badge: 'Fullstack Web Developer & Systems Builder',
      primaryCta: 'Lihat Proyek',
      secondaryCta: 'Baca Artikel Teknis',
      contactCta: 'Diskusi Proyek',
    },
    home: {
      introTitle: 'Pendekatan Rekayasa',
      featuredProjectsTitle: 'Proyek Pilihan',
      featuredProjectsSubtitle: 'Implementasi nyata aplikasi bisnis, otomasi, dan sistem data.',
      viewAllProjects: 'Semua Proyek',
      stackTitle: 'Teknologi Utama',
      expertiseTitle: 'Area Keahlian Teknis',
      latestPostsTitle: 'Tulisan Teknis Terbaru',
      latestPostsSubtitle: 'Catatan arsitektur, tutorial backend, dan praktik rekayasa web.',
      viewAllPosts: 'Semua Artikel',
      ctaTitle: 'Butuh solusi perangkat lunak yang terstruktur dan siap produksi?',
      ctaDescription: 'Terbuka untuk diskusi proyek fullstack, integrasi sistem, maupun otomasi proses bisnis.',
      ctaButton: 'Hubungi Saya',
      emptyProjects: 'Belum ada proyek yang dipublikasikan. Tambahkan melalui Admin CMS.',
      emptyPosts: 'Belum ada artikel yang dipublikasikan. Tambahkan melalui Admin CMS.',
    },
    about: {
      title: 'Tentang Saya',
      subtitle: 'Latar belakang teknis, filosofi pengembangan, dan fokus spesialisasi.',
      backgroundTitle: 'Latar Belakang Profesional',
      philosophyTitle: 'Filosofi Pengembangan',
      expertiseTitle: 'Spesialisasi & Keahlian',
      experienceTitle: 'Sorotan Pengalaman',
      experienceSubtitle: 'Rekam jejak pengembangan aplikasi bisnis, integrasi sistem, dan kepemimpinan teknis.',
      experienceTimelineLabel: 'Rekam Jejak Karir',
      contactTitle: 'Tautan Profesional',
    },
    projects: {
      title: 'Portofolio Proyek',
      subtitle: 'Studi kasus teknis dari sistem bisnis, platform web, dan otomasi.',
      allFilter: 'Semua',
      featuredBadge: 'Unggulan',
      confidentialBadge: 'Rahasia / NDA',
      confidentialNote: 'Kode sumber dan detail sensitif bersifat rahasia sesuai perjanjian klien.',
      roleLabel: 'Peran',
      categoryLabel: 'Kategori',
      stackLabel: 'Teknologi',
      demoButton: 'Lihat Demo',
      repoButton: 'Lihat Repositori',
      backToList: 'Kembali ke daftar proyek',
      emptyState: 'Belum ada proyek yang dipublikasikan untuk bahasa ini.',
      noFilterMatch: 'Tidak ada proyek yang cocok dengan filter teknologi ini.',
      breadcrumbsHome: 'Beranda',
      showAllButton: 'Tampilkan semua',
      showLessButton: 'Tampilkan 6 teratas',
      countPrefix: 'Menampilkan',
      countConnector: 'dari',
      countUnit: 'proyek',
      prevModal: 'Sebelumnya',
      nextModal: 'Berikutnya',
      modalNavLabel: 'Navigasi antar studi kasus',
      openFullPage: 'Halaman Lengkap',
      publishedLabel: 'Dipublikasikan',
      sidebarCtaTitle: 'Tertarik dengan arsitektur serupa?',
      sidebarCtaButton: 'Hubungi Saya',
      relatedTitle: 'Studi Kasus Lainnya',
      prevProject: 'Proyek Sebelumnya',
      nextProject: 'Proyek Berikutnya',
    },
    freelance: {
      mainTabLabel: 'Karya Utama',
      freelanceTabLabel: 'Proyek Freelance',
      contributionLabel: 'Kontribusi',
      approachLabel: 'Pendekatan',
      impactLabel: 'Dampak',
      detailButton: 'Detail',
      noFilterMatch: 'Tidak ada proyek freelance yang cocok dengan filter teknologi ini.',
      closeModalLabel: 'Tutup detail proyek freelance',
      tabGroupLabel: 'Pilihan kategori portofolio',
      filterGroupLabel: 'Filter proyek freelance berdasarkan teknologi',
    },
    blog: {
      title: 'Blog Teknis',
      subtitle: 'Tutorial pemrograman, arsitektur perangkat lunak, dan catatan implementasi.',
      searchPlaceholder: 'Cari artikel atau proyek...',
      allTags: 'Semua Topik',
      readingTime: 'menit baca',
      publishedOn: 'Dipublikasikan',
      updatedOn: 'Diperbarui',
      tocTitle: 'Daftar Isi',
      copyCode: 'Salin',
      copiedCode: 'Tersalin',
      shareTitle: 'Bagikan Artikel',
      relatedTitle: 'Artikel Terkait',
      prevPost: 'Artikel Sebelumnya',
      nextPost: 'Artikel Berikutnya',
      backToList: 'Kembali ke blog',
      emptyState: 'Belum ada artikel yang dipublikasikan untuk bahasa ini.',
    },
    contact: {
      title: 'Kontak',
      subtitle: 'Hubungi langsung melalui email atau jejaring profesional.',
      directLinksTitle: 'Kanal Langsung',
      sendEmail: 'Kirim Email',
      copyEmail: 'Salin Email',
      copiedEmail: 'Tersalin',
      copySuccessAnnouncement: 'Alamat email disalin ke papan klip.',
      emptyNotice: 'Kanal kontak belum dikonfigurasi.',
    },
    search: {
      title: 'Pencarian',
      subtitle: 'Temukan artikel teknis dan studi kasus proyek.',
      placeholder: 'Ketik kata kunci (mis. Astro, SQLite, API)...',
      noIndexYet: 'Indeks pencarian akan tersedia setelah proses build/publish selesai.',
      emptyQuery: 'Masukkan kata kunci untuk mulai mencari.',
    },
    footer: {
      navigation: 'Navigasi',
      connect: 'Terhubung',
      rights: 'Hak cipta dilindungi.',
      rss: 'RSS Feed',
      switchLangNote: 'Versi bahasa Inggris tersedia',
    },
  },
  en: {
    localeName: 'English',
    shortCode: 'EN',
    nav: {
      home: 'Home',
      about: 'About',
      projects: 'Projects',
      blog: 'Blog',
      contact: 'Contact',
      search: 'Search',
    },
    skipToContent: 'Skip to main content',
    themeToggle: 'Toggle theme',
    lightMode: 'Light mode',
    darkMode: 'Dark mode',
    languageLabel: 'Select language',
    hero: {
      badge: 'Fullstack Web Developer & Systems Builder',
      primaryCta: 'Explore Projects',
      secondaryCta: 'Read Technical Blog',
      contactCta: 'Get in Touch',
    },
    home: {
      introTitle: 'Engineering Approach',
      featuredProjectsTitle: 'Featured Projects',
      featuredProjectsSubtitle: 'Production business applications, workflow automation, and data systems.',
      viewAllProjects: 'All Projects',
      stackTitle: 'Core Stack',
      expertiseTitle: 'Selected Technical Expertise',
      latestPostsTitle: 'Latest Technical Articles',
      latestPostsSubtitle: 'Architecture notes, backend engineering guides, and practical tutorials.',
      viewAllPosts: 'All Articles',
      ctaTitle: 'Looking for reliable, maintainable fullstack engineering?',
      ctaDescription: 'Available for fullstack architecture, system integrations, and business automation projects.',
      ctaButton: 'Contact Me',
      emptyProjects: 'No published projects yet. Add them from the Admin CMS.',
      emptyPosts: 'No published articles yet. Add them from the Admin CMS.',
    },
    about: {
      title: 'About Me',
      subtitle: 'Engineering background, development philosophy, and core specializations.',
      backgroundTitle: 'Professional Background',
      philosophyTitle: 'Development Philosophy',
      expertiseTitle: 'Areas of Expertise',
      experienceTitle: 'Experience Highlights',
      experienceSubtitle: 'Track record across business applications, system integrations, and technical leadership.',
      experienceTimelineLabel: 'Career Timeline',
      contactTitle: 'Professional Links',
    },
    projects: {
      title: 'Projects',
      subtitle: 'Technical case studies across business systems, web platforms, and automation.',
      allFilter: 'All',
      featuredBadge: 'Featured',
      confidentialBadge: 'Confidential / NDA',
      confidentialNote: 'Source code and sensitive client details are restricted under NDA.',
      roleLabel: 'Role',
      categoryLabel: 'Category',
      stackLabel: 'Tech Stack',
      demoButton: 'Live Demo',
      repoButton: 'Source Code',
      backToList: 'Back to all projects',
      emptyState: 'No published projects in English yet.',
      noFilterMatch: 'No projects match the selected technology filter.',
      breadcrumbsHome: 'Home',
      showAllButton: 'Show all',
      showLessButton: 'Show top 6',
      countPrefix: 'Showing',
      countConnector: 'of',
      countUnit: 'projects',
      prevModal: 'Previous',
      nextModal: 'Next',
      modalNavLabel: 'Case study navigation',
      openFullPage: 'Standalone Page',
      publishedLabel: 'Published',
      sidebarCtaTitle: 'Interested in similar architecture?',
      sidebarCtaButton: 'Get in Touch',
      relatedTitle: 'More Case Studies',
      prevProject: 'Previous Project',
      nextProject: 'Next Project',
    },
    freelance: {
      mainTabLabel: 'Featured Work',
      freelanceTabLabel: 'Freelance Work',
      contributionLabel: 'Contribution',
      approachLabel: 'Approach',
      impactLabel: 'Impact',
      detailButton: 'Details',
      noFilterMatch: 'No freelance projects match the selected technology filter.',
      closeModalLabel: 'Close freelance project details',
      tabGroupLabel: 'Portfolio category selector',
      filterGroupLabel: 'Filter freelance projects by stack',
    },
    blog: {
      title: 'Technical Blog',
      subtitle: 'Programming guides, software architecture deep-dives, and engineering notes.',
      searchPlaceholder: 'Search articles or projects...',
      allTags: 'All Topics',
      readingTime: 'min read',
      publishedOn: 'Published',
      updatedOn: 'Updated',
      tocTitle: 'Table of Contents',
      copyCode: 'Copy',
      copiedCode: 'Copied',
      shareTitle: 'Share Article',
      relatedTitle: 'Related Articles',
      prevPost: 'Previous Article',
      nextPost: 'Next Article',
      backToList: 'Back to blog',
      emptyState: 'No published articles in English yet.',
    },
    contact: {
      title: 'Contact',
      subtitle: 'Reach out directly via email or professional profiles.',
      directLinksTitle: 'Direct Channels',
      sendEmail: 'Send Email',
      copyEmail: 'Copy Email',
      copiedEmail: 'Copied',
      copySuccessAnnouncement: 'Email address copied to clipboard.',
      emptyNotice: 'Contact channels have not been configured yet.',
    },
    search: {
      title: 'Search',
      subtitle: 'Find technical articles and project case studies.',
      placeholder: 'Type keywords (e.g. Astro, SQLite, API)...',
      noIndexYet: 'Search index will be available after the site build/publish completes.',
      emptyQuery: 'Enter keywords to search.',
    },
    footer: {
      navigation: 'Navigation',
      connect: 'Connect',
      rights: 'All rights reserved.',
      rss: 'RSS Feed',
      switchLangNote: 'Versi Bahasa Indonesia tersedia',
    },
  },
} as const;

export function getTranslations(locale: Locale) {
  return UI_TRANSLATIONS[locale];
}

export function isValidLocale(value: string | undefined): value is Locale {
  return value === 'id' || value === 'en';
}

export function getLocalizedSectionPath(locale: Locale, section: 'home' | 'about' | 'projects' | 'blog' | 'contact' | 'search'): string {
  const routes: Record<Locale, Record<typeof section, string>> = {
    id: {
      home: '/id/',
      about: '/id/#tentang',
      projects: '/id/#proyek',
      blog: '/id/blog/',
      contact: '/id/#kontak',
      search: '/id/cari/',
    },
    en: {
      home: '/',
      about: '/#about',
      projects: '/#projects',
      blog: '/en/blog/',
      contact: '/#contact',
      search: '/en/search/',
    },
  };
  return routes[locale][section];
}

export function getPostUrl(locale: Locale, slug: string): string {
  return `/${locale}/blog/${slug}/`;
}

export function getProjectUrl(locale: Locale, slug: string): string {
  return locale === 'id' ? `/id/proyek/${slug}/` : `/en/projects/${slug}/`;
}

export function formatDate(date: Date | number | null | undefined, locale: Locale): string {
  if (!date) return '';
  const d = typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === 'id' ? 'id-ID' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}
