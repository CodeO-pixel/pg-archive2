'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { 
  Upload, User, Eye, ArrowLeft, Download, Trash2, Clock, Sparkles, UserPlus, Shield, Search, Tag, Filter, Home as HomeIcon, BookOpen, ChevronLeft, ChevronRight, Bell, Heart
} from 'lucide-react';

interface Chapter {
  id: string;
  series_id: string;
  chapter_number: string;
  title: string;
  uploaded_by: string;
  pages: any;
  created_at?: string;
}

interface Series {
  id: string;
  title: string;
  type: string;
  synopsis: string;
  cover_url: string;
  tags?: string[];
  created_at?: string;
}

interface Notification {
  id: string;
  user_id: string;
  series_id: string | null;
  chapter_id: string | null;
  message: string;
  is_read: boolean;
  created_at?: string;
}

const AVAILABLE_TAGS = ['Acción', 'Aventura', 'Comedia', 'Drama', 'Fantasía', 'Romance', 'Sci-Fi', 'Isekai', 'Slice of Life', 'Misterio'];

export default function Home() {
  const [currentTab, setCurrentTab] = useState<'inicio' | 'biblioteca'>('inicio');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'scan' | 'lector' | null>(null);
  
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [chaptersList, setChaptersList] = useState<Chapter[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // Filtros de Biblioteca
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState('Todos');
  const [selectedTagFilter, setSelectedTagFilter] = useState('Todas');

  // Modales
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showNewPasswordForm, setShowNewPasswordForm] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [downloadFormat, setDownloadFormat] = useState<'cbz' | 'pdf'>('cbz');

  // Auth Form
  const [emailInput, setEmailInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Seguir obras y notificaciones internas
  const [followedSeriesIds, setFollowedSeriesIds] = useState<Set<string>>(new Set());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Admin Create User Form
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'scan' | 'lector'>('scan');

  // Formulario Subida
  const [isNewSeries, setIsNewSeries] = useState(true);
  const [targetSeriesId, setTargetSeriesId] = useState('');
  const [seriesTitle, setSeriesTitle] = useState('');
  const [seriesType, setSeriesType] = useState('Manga');
  const [seriesSynopsis, setSeriesSynopsis] = useState('');
  const [seriesTags, setSeriesTags] = useState<string[]>([]);
  const [chapterNum, setChapterNum] = useState('1');
  const [chapterTitle, setChapterTitle] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [pagesFiles, setPagesFiles] = useState<FileList | null>(null);

  useEffect(() => {
    checkSession();
    fetchData();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setCurrentUser(session?.user || null);
        setShowNewPasswordForm(true);
        setShowAuth(true);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setCurrentUser(session.user);
      await fetchUserRole(session.user.id, session.user.email || '');
      await fetchFollows(session.user.id);
      await fetchNotifications(session.user.id);
    } else {
      setCurrentUser(null);
      setUserRole(null);
    }
  };

  const fetchFollows = async (userId: string) => {
    const { data } = await supabase.from('follows').select('series_id').eq('user_id', userId);
    if (data) setFollowedSeriesIds(new Set(data.map((f: any) => f.series_id)));
  };

  const fetchNotifications = async (userId: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setNotifications(data);
  };

  const fetchUserRole = async (userId: string, email: string) => {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
    if (data) {
      setUserRole(data.role);
    } else {
      // El primer usuario registrado recibe permisos de Admin automáticamente
      const { data: countData } = await supabase.from('profiles').select('id', { count: 'exact' });
      const assignedRole = (!countData || countData.length === 0) ? 'admin' : 'lector';

      await supabase.from('profiles').insert([{ id: userId, email, role: assignedRole }]);
      setUserRole(assignedRole);
    }
  };

  const fetchData = async () => {
    try {
      const { data: seriesData } = await supabase.from('series').select('*').order('created_at', { ascending: false });
      const { data: chaptersData } = await supabase.from('chapters').select('*').order('created_at', { ascending: false });

      if (seriesData) setSeriesList(seriesData);
      if (chaptersData) setChaptersList(chaptersData);
    } catch (err) {
      console.error('Error cargando datos:', err);
    }
  };

  const getPageUrls = (pages: any): string[] => {
    if (!pages) return [];
    if (Array.isArray(pages)) return pages;
    if (typeof pages === 'string') {
      try {
        const parsed = JSON.parse(pages);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  // AUTENTICACIÓN: LOGIN (usuario + contraseña) Y REGISTRO (correo + usuario + contraseña)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (authMode === 'reset') {
        // Buscamos el correo asociado al usuario y le mandamos el link de recuperación
        const { data: foundEmail, error: lookupErr } = await supabase.rpc('get_email_by_username', {
          lookup_username: usernameInput.trim(),
        });
        if (lookupErr) throw new Error('No se pudo verificar el usuario: ' + lookupErr.message);
        if (!foundEmail) throw new Error('No existe ninguna cuenta con ese nombre de usuario.');

        const { error } = await supabase.auth.resetPasswordForEmail(foundEmail, {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        });
        if (error) throw error;

        alert('Te enviamos un correo con un link para elegir una nueva contraseña.');
        setShowAuth(false);
        setUsernameInput('');
        setAuthMode('login');
        return;
      }

      if (authMode === 'login') {
        // El login es por nombre de usuario: primero buscamos el correo asociado
        const { data: foundEmail, error: lookupErr } = await supabase.rpc('get_email_by_username', {
          lookup_username: usernameInput.trim(),
        });
        if (lookupErr) throw new Error('No se pudo verificar el usuario: ' + lookupErr.message);
        if (!foundEmail) throw new Error('No existe ninguna cuenta con ese nombre de usuario.');

        const { data, error } = await supabase.auth.signInWithPassword({
          email: foundEmail,
          password: passwordInput,
        });
        if (error) throw error;
        if (data.user) {
          setCurrentUser(data.user);
          await fetchUserRole(data.user.id, data.user.email || '');
          await fetchFollows(data.user.id);
          await fetchNotifications(data.user.id);
        }
      } else {
        if (!usernameInput.trim()) throw new Error('Elige un nombre de usuario.');

        // El primer usuario registrado recibe permisos de Admin automáticamente
        const { data: isFirst } = await supabase.rpc('is_first_user');
        const assignedRole = isFirst ? 'admin' : 'lector';

        const { data, error } = await supabase.auth.signUp({
          email: emailInput,
          password: passwordInput,
          options: { data: { username: usernameInput.trim(), role: assignedRole } },
        });
        if (error) throw error;
        if (!data.user) throw new Error('No se pudo crear la cuenta.');

        if (data.session) {
          // Sesión inmediata: tu proyecto no exige confirmar el correo
          setCurrentUser(data.user);
          setUserRole(assignedRole);
          alert('¡Cuenta creada e iniciada con éxito!');
        } else {
          // Tu proyecto de Supabase exige confirmar el correo antes de poder entrar
          alert('¡Cuenta creada! Revisa tu correo y confirma tu cuenta antes de iniciar sesión.');
        }
      }
      setShowAuth(false);
      setEmailInput('');
      setUsernameInput('');
      setPasswordInput('');
    } catch (err: any) {
      alert('Error de autenticación: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (newPasswordInput.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');

      const { error } = await supabase.auth.updateUser({ password: newPasswordInput });
      if (error) throw error;

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUser(session.user);
        await fetchUserRole(session.user.id, session.user.email || '');
        await fetchFollows(session.user.id);
        await fetchNotifications(session.user.id);
      }

      alert('¡Contraseña actualizada! Ya iniciaste sesión.');
      setShowNewPasswordForm(false);
      setShowAuth(false);
      setNewPasswordInput('');
    } catch (err: any) {
      alert('Error actualizando la contraseña: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUserRole(null);
    setFollowedSeriesIds(new Set());
    setNotifications([]);
    setShowNotifications(false);
  };

  // SEGUIR / DEJAR DE SEGUIR UNA OBRA
  const handleToggleFollow = async (seriesId: string) => {
    if (!currentUser) { setShowAuth(true); return; }
    const isFollowing = followedSeriesIds.has(seriesId);
    try {
      if (isFollowing) {
        const { error } = await supabase.from('follows').delete().eq('user_id', currentUser.id).eq('series_id', seriesId);
        if (error) throw error;
        setFollowedSeriesIds(prev => {
          const next = new Set(prev);
          next.delete(seriesId);
          return next;
        });
      } else {
        const { error } = await supabase.from('follows').insert([{ user_id: currentUser.id, series_id: seriesId }]);
        if (error) throw error;
        setFollowedSeriesIds(prev => new Set(prev).add(seriesId));
      }
    } catch (err: any) {
      alert('No se pudo actualizar el seguimiento: ' + err.message);
    }
  };

  // NOTIFICACIONES
  const handleMarkNotificationRead = async (notifId: string) => {
    setNotifications(prev => prev.map(n => (n.id === notifId ? { ...n, is_read: true } : n)));
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!currentUser) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', currentUser.id).eq('is_read', false);
  };

  const handleNotificationClick = (notif: Notification) => {
    handleMarkNotificationRead(notif.id);
    setShowNotifications(false);
    if (notif.series_id) {
      const series = seriesList.find(s => s.id === notif.series_id);
      if (series) {
        setSelectedChapter(null);
        setSelectedSeries(series);
        setCurrentTab('biblioteca');
      }
    }
  };

  const handleAdminCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!newUserUsername.trim()) throw new Error('Elige un nombre de usuario para tu amigo.');

      const tempSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
      );

      const { data, error } = await tempSupabase.auth.signUp({
        email: newUserEmail,
        password: newUserPassword,
        options: { data: { username: newUserUsername.trim(), role: newUserRole } },
      });

      if (error) throw error;
      if (!data.user) throw new Error('No se pudo crear el usuario.');

      const needsConfirmation = !data.session;

      alert(
        `Usuario "${newUserUsername}" (${newUserEmail}) creado con rol "${newUserRole}".` +
        (needsConfirmation ? '\n\nDebe confirmar su correo antes de poder iniciar sesión.' : '')
      );
      setShowCreateUser(false);
      setNewUserEmail('');
      setNewUserUsername('');
      setNewUserPassword('');
    } catch (err: any) {
      alert('Error creando usuario: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadChapter = async (chap: Chapter) => {
    setDownloading(true);
    try {
      const urls = getPageUrls(chap.pages);
      const fileName = `${selectedSeries?.title || 'Obra'} - Cap ${chap.chapter_number}`;

      if (downloadFormat === 'cbz') {
        const zip = new JSZip();
        for (let i = 0; i < urls.length; i++) {
          const response = await fetch(urls[i]);
          const blob = await response.blob();
          const ext = urls[i].split('.').pop()?.split('?')[0] || 'jpg';
          zip.file(`pagina_${String(i + 1).padStart(3, '0')}.${ext}`, blob);
        }

        const cbzBlob = await zip.generateAsync({ type: 'blob' });
        const downloadUrl = URL.createObjectURL(cbzBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${fileName}.cbz`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      } else {
        let jsPDFModule;
        try {
          jsPDFModule = await import('jspdf');
        } catch {
          throw new Error('Ejecuta "npm install jspdf" en la terminal.');
        }

        const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
        const pdf = new jsPDF('p', 'mm', 'a4');

        for (let i = 0; i < urls.length; i++) {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.src = urls[i];
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error(`Error cargando página ${i + 1}`));
          });

          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (img.height * pdfWidth) / img.width;

          if (i > 0) pdf.addPage([pdfWidth, pdfHeight]);
          pdf.addImage(img, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        }

        pdf.save(`${fileName}.pdf`);
      }
    } catch (err: any) {
      alert('Error al descargar: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleDeleteChapter = async (chapId: string, pages: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('¿Estás seguro de eliminar este capítulo?')) return;
    
    try {
      setLoading(true);
      const urls = getPageUrls(pages);
      const fileNames = urls.map(u => u.split('/').pop()?.split('?')[0]).filter(Boolean) as string[];

      if (fileNames.length > 0) {
        try {
          await supabase.storage.from('chapter-pages').remove(fileNames);
        } catch (stErr) {
          console.warn('Limpiando storage:', stErr);
        }
      }

      const { error } = await supabase.from('chapters').delete().eq('id', chapId);
      if (error) throw error;

      if (selectedChapter?.id === chapId) setSelectedChapter(null);
      await fetchData();
      alert('Capítulo eliminado correctamente.');
    } catch (err: any) {
      alert('Error eliminando capítulo: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSeries = async (seriesId: string, coverUrl: string) => {
    if (!confirm('¿Estás seguro de eliminar esta obra?')) return;
    
    try {
      setLoading(true);
      const seriesChaps = chaptersList.filter(c => c.series_id === seriesId);

      for (const chap of seriesChaps) {
        const urls = getPageUrls(chap.pages);
        const fileNames = urls.map(u => u.split('/').pop()?.split('?')[0]).filter(Boolean) as string[];
        if (fileNames.length > 0) {
          try {
            await supabase.storage.from('chapter-pages').remove(fileNames);
          } catch (e) {
            console.warn('Error borrando páginas:', e);
          }
        }
      }

      await supabase.from('chapters').delete().eq('series_id', seriesId);

      if (coverUrl) {
        const coverName = coverUrl.split('/').pop()?.split('?')[0];
        if (coverName) {
          try {
            await supabase.storage.from('covers').remove([coverName]);
          } catch (e) {
            console.warn('Error borrando portada:', e);
          }
        }
      }

      const { error } = await supabase.from('series').delete().eq('id', seriesId);
      if (error) throw error;

      setSelectedSeries(null);
      setSelectedChapter(null);
      await fetchData();
      alert('Obra eliminada con éxito.');
    } catch (err: any) {
      alert('Error eliminando la obra: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleTagSelection = (tag: string) => {
    setSeriesTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUploadStatus('Procesando datos...');

    try {
      let finalSeriesId = targetSeriesId;

      if (isNewSeries) {
        if (!seriesTitle.trim()) throw new Error('Ingresa un título para la obra.');

        let coverUrl = '';
        if (coverFile) {
          const cleanName = coverFile.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const fileName = `cover_${Date.now()}_${cleanName}`;
          const { error: coverErr } = await supabase.storage.from('covers').upload(fileName, coverFile);
          
          if (!coverErr) {
            const { data } = supabase.storage.from('covers').getPublicUrl(fileName);
            coverUrl = data.publicUrl;
          }
        }

        const { data: newSeries, error: seriesErr } = await supabase
          .from('series')
          .insert([{ 
            title: seriesTitle, 
            type: seriesType, 
            synopsis: seriesSynopsis, 
            cover_url: coverUrl,
            tags: seriesTags 
          }])
          .select()
          .single();

        if (seriesErr) throw new Error('Error al crear serie: ' + seriesErr.message);
        finalSeriesId = newSeries.id;
      } else {
        if (!finalSeriesId) throw new Error('Selecciona una obra existente.');
      }

      if (!pagesFiles || pagesFiles.length === 0) throw new Error('Selecciona al menos un archivo.');

      const seriesTitleForNotif = isNewSeries ? seriesTitle : (seriesList.find(s => s.id === finalSeriesId)?.title || 'una obra que sigues');

      const allFiles = Array.from(pagesFiles);
      const packageFiles = allFiles.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return ext === 'cbz' || ext === 'zip';
      });
      const looseImageFiles = allFiles.filter(f => !packageFiles.includes(f));

      // Descomprime un .cbz/.zip y devuelve sus imágenes ordenadas
      const extractImagesFromPackage = async (file: File): Promise<File[]> => {
        const zip = await JSZip.loadAsync(file);
        const imageEntries = Object.keys(zip.files)
          .filter(fn => !zip.files[fn].dir && /\.(jpg|jpeg|png|webp|avif|gif)$/i.test(fn))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const images: File[] = [];
        for (const filename of imageEntries) {
          const blob = await zip.files[filename].async('blob');
          const cleanName = filename.split('/').pop() || filename;
          images.push(new File([blob], cleanName, { type: blob.type || 'image/jpeg' }));
        }
        return images;
      };

      // Sube las páginas de un capítulo y crea su registro en la base de datos
      const publishChapter = async (imageFiles: File[], number: string, title: string, tag: string) => {
        const uploadedPageUrls: string[] = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          setUploadStatus(`Cap. ${number}: subiendo página ${i + 1} de ${imageFiles.length}...`);
          const cleanName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const fileName = `page_${Date.now()}_${tag}_${i}_${cleanName}`;

          const { error: pageErr } = await supabase.storage.from('chapter-pages').upload(fileName, file);
          if (pageErr) throw new Error(`Error subiendo una página de "${title}": ${pageErr.message}`);

          const { data } = supabase.storage.from('chapter-pages').getPublicUrl(fileName);
          uploadedPageUrls.push(data.publicUrl);
        }

        const { data: newChap, error: chapErr } = await supabase.from('chapters').insert([{
          series_id: finalSeriesId,
          chapter_number: number,
          title,
          uploaded_by: currentUser?.email || 'Scan User',
          pages: uploadedPageUrls
        }]).select().single();
        if (chapErr) throw new Error(`Error registrando el capítulo "${title}": ${chapErr.message}`);

        // Avisar a quienes siguen esta obra
        const { data: followers } = await supabase.from('follows').select('user_id').eq('series_id', finalSeriesId);
        if (followers && followers.length > 0) {
          const notifRows = followers.map((f: any) => ({
            user_id: f.user_id,
            series_id: finalSeriesId,
            chapter_id: newChap?.id || null,
            message: `Nuevo capítulo: "${title}" en ${seriesTitleForNotif}.`,
          }));
          await supabase.from('notifications').insert(notifRows);
        }
      };

      if (packageFiles.length > 1) {
        // VARIOS CAPÍTULOS A LA VEZ: cada .cbz/.zip seleccionado es un capítulo independiente
        const sortedPackages = [...packageFiles].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );

        let autoNumber = parseFloat(chapterNum) || 1;
        let published = 0;

        for (const pkg of sortedPackages) {
          setUploadStatus(`Descomprimiendo ${pkg.name}...`);
          const images = await extractImagesFromPackage(pkg);
          if (images.length === 0) continue; // paquete sin imágenes válidas, se omite

          const nameMatch = pkg.name.match(/(\d+(\.\d+)?)/);
          const number = nameMatch ? nameMatch[1] : String(autoNumber);
          const title = chapterTitle ? `${chapterTitle} ${number}` : `Capítulo ${number}`;

          await publishChapter(images, number, title, `b${published}`);
          autoNumber++;
          published++;
        }

        if (published === 0) throw new Error('Ninguno de los archivos .cbz/.zip seleccionados contenía imágenes válidas.');
      } else {
        // UN SOLO CAPÍTULO: un único paquete .cbz/.zip, o imágenes sueltas
        let imagesForChapter: File[] = [...looseImageFiles];
        if (packageFiles.length === 1) {
          setUploadStatus(`Descomprimiendo ${packageFiles[0].name}...`);
          imagesForChapter = [...imagesForChapter, ...(await extractImagesFromPackage(packageFiles[0]))];
        }
        if (imagesForChapter.length === 0) throw new Error('El archivo seleccionado no contiene imágenes válidas.');

        await publishChapter(imagesForChapter, chapterNum, chapterTitle || `Capítulo ${chapterNum}`, 's0');
      }

      await fetchData();
      setShowUpload(false);
      setSeriesTitle('');
      setSeriesSynopsis('');
      setSeriesTags([]);
      setChapterTitle('');
      setChapterNum('1');
      setCoverFile(null);
      setPagesFiles(null);
      alert('¡Contenido publicado con éxito!');
    } catch (err: any) {
      alert('Atención: ' + err.message);
    } finally {
      setLoading(false);
      setUploadStatus('');
    }
  };

  // LÓGICA DE FILTRADO PARA LA BIBLIOTECA
  const filteredSeries = seriesList.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.synopsis && item.synopsis.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesType = selectedTypeFilter === 'Todos' || item.type === selectedTypeFilter;
    
    const matchesTag = selectedTagFilter === 'Todas' || (item.tags && item.tags.includes(selectedTagFilter));

    return matchesSearch && matchesType && matchesTag;
  });

  const canUpload = userRole === 'admin' || userRole === 'scan';

  // NAVEGACIÓN ENTRE CAPÍTULOS (anterior / siguiente dentro de la misma obra)
  const currentSeriesChaptersSorted = selectedChapter
    ? chaptersList
        .filter(c => c.series_id === selectedChapter.series_id)
        .sort((a, b) => parseFloat(a.chapter_number) - parseFloat(b.chapter_number))
    : [];

  const currentChapterIndex = selectedChapter
    ? currentSeriesChaptersSorted.findIndex(c => c.id === selectedChapter.id)
    : -1;

  const previousChapter = currentChapterIndex > 0 ? currentSeriesChaptersSorted[currentChapterIndex - 1] : null;
  const nextChapter =
    currentChapterIndex >= 0 && currentChapterIndex < currentSeriesChaptersSorted.length - 1
      ? currentSeriesChaptersSorted[currentChapterIndex + 1]
      : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) && (
        <div className="bg-red-900 text-red-100 text-xs sm:text-sm font-bold text-center py-2 px-4">
          ⚠️ Faltan las variables de entorno de Supabase. Configúralas en tu hosting (Environment Variables) y vuelve a desplegar.
        </div>
      )}
      {/* HEADER / NAVEGACIÓN */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center space-x-3 sm:space-x-6">
          <h1 
            className="text-xl sm:text-2xl font-black text-cyan-400 cursor-pointer tracking-wider hover:opacity-80 transition"
            onClick={() => { setSelectedSeries(null); setSelectedChapter(null); setCurrentTab('inicio'); }}
          >
            PG-<span className="text-white">ARCHIVE</span>
          </h1>

          <nav className="flex space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button 
              onClick={() => { setSelectedSeries(null); setSelectedChapter(null); setCurrentTab('inicio'); }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1.5 transition ${currentTab === 'inicio' && !selectedSeries ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <HomeIcon className="w-3.5 h-3.5" />
              <span>Inicio</span>
            </button>
            <button 
              onClick={() => { setSelectedSeries(null); setSelectedChapter(null); setCurrentTab('biblioteca'); }}
              className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center space-x-1.5 transition ${currentTab === 'biblioteca' && !selectedSeries ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Biblioteca</span>
            </button>
          </nav>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {userRole === 'admin' && (
            <button 
              onClick={() => setShowCreateUser(true)}
              className="bg-purple-700 hover:bg-purple-600 text-white font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-1.5 border border-purple-500 shadow transition text-xs sm:text-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Crear Usuario</span>
            </button>
          )}

          {canUpload && (
            <button 
              onClick={() => {
                if (seriesList.length > 0) setTargetSeriesId(seriesList[0].id);
                setShowUpload(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg flex items-center space-x-1.5 border border-emerald-400 shadow transition text-xs sm:text-sm"
            >
              <Upload className="w-4 h-4" />
              <span>Subir</span>
            </button>
          )}

          {currentUser && (
            <div className="relative">
              <button
                onClick={() => setShowNotifications(prev => !prev)}
                className="relative bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 p-2 sm:p-2.5 rounded-lg transition"
                title="Notificaciones"
              >
                <Bell className="w-4 h-4" />
                {notifications.some(n => !n.is_read) && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center border border-slate-900">
                    {notifications.filter(n => !n.is_read).length > 9 ? '9+' : notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <div className="absolute right-0 mt-2 w-80 max-w-[85vw] max-h-[70vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 sticky top-0 bg-slate-900">
                      <h4 className="text-sm font-bold text-white">Notificaciones</h4>
                      {notifications.some(n => !n.is_read) && (
                        <button onClick={handleMarkAllNotificationsRead} className="text-[11px] font-bold text-cyan-400 hover:underline">
                          Marcar todas leídas
                        </button>
                      )}
                    </div>
                    {notifications.length === 0 ? (
                      <p className="text-center text-slate-500 text-xs py-8 px-4">Todavía no tienes notificaciones. Sigue una obra para recibir avisos de capítulos nuevos.</p>
                    ) : (
                      <div className="divide-y divide-slate-800">
                        {notifications.map(n => (
                          <button
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-800/70 transition ${!n.is_read ? 'bg-cyan-950/30' : ''}`}
                          >
                            <p className={`text-xs ${!n.is_read ? 'text-white font-semibold' : 'text-slate-400'}`}>{n.message}</p>
                            {n.created_at && (
                              <p className="text-[10px] text-slate-500 mt-1">{new Date(n.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {currentUser ? (
            <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg text-xs sm:text-sm">
              <User className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold max-w-[120px] sm:max-w-none truncate">{currentUser.email}</span>
              <span className="bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">{userRole}</span>
              <button onClick={handleLogout} className="text-red-400 hover:text-red-300 font-bold ml-1 border-l border-slate-700 pl-2">
                Salir
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowAuth(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-lg border border-cyan-400 transition text-xs sm:text-sm"
            >
              Acceso / Registro
            </button>
          )}
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 p-4 sm:p-6 max-w-6xl mx-auto w-full safe-bottom">
        {selectedChapter ? (
          /* LECTOR DE CAPÍTULO */
          <div>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <button 
                onClick={() => setSelectedChapter(null)} 
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-400 px-4 py-2 rounded-lg font-bold flex items-center space-x-2 transition text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> <span>Volver a la Obra</span>
              </button>

              <div className="flex items-center space-x-2">
                <select 
                  value={downloadFormat} 
                  onChange={(e) => setDownloadFormat(e.target.value as 'cbz' | 'pdf')}
                  className="bg-slate-800 border border-slate-700 text-white font-bold text-xs p-2 rounded-lg focus:outline-none focus:border-cyan-500"
                >
                  <option value="cbz">Formato .CBZ</option>
                  <option value="pdf">Formato .PDF</option>
                </select>

                <button 
                  onClick={() => handleDownloadChapter(selectedChapter)}
                  disabled={downloading}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-lg flex items-center space-x-2 border border-cyan-400 transition text-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>{downloading ? 'Generando...' : 'Descargar'}</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6 text-center shadow-lg">
              <h2 className="text-xl sm:text-2xl font-black text-white">{selectedChapter.title}</h2>
              <p className="text-xs text-slate-400 mt-1">Subido por: <span className="text-cyan-400 font-semibold">{selectedChapter.uploaded_by}</span></p>
            </div>

            <div className="flex justify-between items-center gap-3 mb-6 max-w-3xl mx-auto">
              <button
                onClick={() => previousChapter && setSelectedChapter(previousChapter)}
                disabled={!previousChapter}
                className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800 border border-slate-600 text-cyan-400 px-4 py-2.5 rounded-lg font-bold flex items-center justify-center space-x-2 transition text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> <span>Anterior</span>
              </button>
              <button
                onClick={() => nextChapter && setSelectedChapter(nextChapter)}
                disabled={!nextChapter}
                className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800 border border-slate-600 text-cyan-400 px-4 py-2.5 rounded-lg font-bold flex items-center justify-center space-x-2 transition text-sm"
              >
                <span>Siguiente</span> <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center space-y-4 max-w-3xl mx-auto">
              {getPageUrls(selectedChapter.pages).map((url, idx) => (
                <img key={idx} src={url} alt={`Página ${idx + 1}`} className="w-full rounded-lg shadow-2xl border border-slate-800" loading="lazy" />
              ))}
            </div>

            <div className="flex justify-between items-center gap-3 mt-6 max-w-3xl mx-auto">
              <button
                onClick={() => previousChapter && setSelectedChapter(previousChapter)}
                disabled={!previousChapter}
                className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800 border border-slate-600 text-cyan-400 px-4 py-2.5 rounded-lg font-bold flex items-center justify-center space-x-2 transition text-sm"
              >
                <ChevronLeft className="w-4 h-4" /> <span>Anterior</span>
              </button>
              <button
                onClick={() => nextChapter && setSelectedChapter(nextChapter)}
                disabled={!nextChapter}
                className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-800 border border-slate-600 text-cyan-400 px-4 py-2.5 rounded-lg font-bold flex items-center justify-center space-x-2 transition text-sm"
              >
                <span>Siguiente</span> <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : selectedSeries ? (
          /* DETALLE DE LA OBRA */
          <div>
            <div className="flex justify-between items-center mb-6">
              <button 
                onClick={() => setSelectedSeries(null)} 
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-400 px-4 py-2 rounded-lg font-bold flex items-center space-x-2 transition text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> <span>Volver</span>
              </button>

              {canUpload && (
                <button 
                  onClick={() => handleDeleteSeries(selectedSeries.id, selectedSeries.cover_url)}
                  className="bg-red-950 hover:bg-red-900 border border-red-700 text-red-300 px-4 py-2 rounded-lg font-bold flex items-center space-x-2 text-sm transition"
                >
                  <Trash2 className="w-4 h-4" /> <span>Borrar Obra</span>
                </button>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-xl flex flex-col sm:flex-row gap-6 mb-8 shadow-xl">
              <div className="w-36 h-52 sm:w-44 sm:h-60 bg-slate-950 rounded-lg flex-shrink-0 overflow-hidden border border-slate-800 mx-auto sm:mx-0">
                {selectedSeries.cover_url ? (
                  <img src={selectedSeries.cover_url} alt={selectedSeries.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold text-sm">Sin Portada</div>
                )}
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <span className="bg-cyan-950 text-cyan-400 border border-cyan-800 px-3 py-1 rounded-full text-xs font-bold uppercase">{selectedSeries.type}</span>
                  <button
                    onClick={() => handleToggleFollow(selectedSeries.id)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 transition ${
                      followedSeriesIds.has(selectedSeries.id)
                        ? 'bg-pink-600 border-pink-400 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-pink-400 hover:text-pink-400'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${followedSeriesIds.has(selectedSeries.id) ? 'fill-current' : ''}`} />
                    {followedSeriesIds.has(selectedSeries.id) ? 'Siguiendo' : 'Seguir'}
                  </button>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black mt-3 text-white">{selectedSeries.title}</h2>
                
                {selectedSeries.tags && selectedSeries.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start mt-3">
                    {selectedSeries.tags.map((tg, i) => (
                      <span key={i} className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded border border-slate-700 font-semibold">
                        #{tg}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-slate-300 mt-4 text-sm leading-relaxed">{selectedSeries.synopsis || 'Esta obra no cuenta con una sinopsis.'}</p>
              </div>
            </div>

            <h3 className="text-xl font-bold mb-4 text-white border-b border-slate-800 pb-2">Capítulos Disponibles</h3>
            <div className="space-y-3">
              {chaptersList.filter(c => c.series_id === selectedSeries.id).map(chap => (
                <div key={chap.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 hover:border-cyan-500/50 transition shadow">
                  <div className="min-w-0">
                    <h4 className="font-bold text-white text-base sm:text-lg break-words">{chap.title}</h4>
                    <p className="text-xs text-slate-400">Capítulo #{chap.chapter_number} • Subido por {chap.uploaded_by}</p>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    {canUpload && (
                      <button 
                        onClick={(e) => handleDeleteChapter(chap.id, chap.pages, e)}
                        className="bg-red-950/60 hover:bg-red-900 text-red-400 border border-red-800/80 p-2 rounded-lg transition"
                        title="Borrar capítulo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => setSelectedChapter(chap)} 
                      className="flex-1 sm:flex-initial justify-center bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-2 sm:px-4 sm:py-2 rounded-lg border border-cyan-400 transition text-xs sm:text-sm flex items-center space-x-2"
                    >
                      <Eye className="w-4 h-4" /> <span>Leer</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : currentTab === 'inicio' ? (
          /* VISTA: INICIO / BANNER Y ACTUALIZACIONES */
          <div className="space-y-10">
            {/* HERO BANNER */}
            <div className="bg-gradient-to-r from-cyan-950 via-slate-900 to-slate-950 border border-cyan-800/50 p-6 sm:p-10 rounded-2xl shadow-2xl text-center sm:text-left relative overflow-hidden">
              <div className="max-w-xl">
                <span className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest inline-block mb-3">
                  Archivo Privado
                </span>
                <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">Tu lector personal de cómics y manga.</h2>
                <p className="text-slate-300 text-sm mt-3">Lee online o descarga tus obras favoritas en formato PDF o CBZ desde cualquier dispositivo.</p>
                <button 
                  onClick={() => setCurrentTab('biblioteca')} 
                  className="mt-6 bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-6 py-2.5 rounded-lg border border-cyan-400 shadow-lg transition text-sm"
                >
                  Explorar Biblioteca Completa
                </button>
              </div>
            </div>

            {/* ÚLTIMAS ACTUALIZACIONES */}
            {chaptersList.length > 0 && (
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-xl font-black text-white tracking-wide">Últimas Actualizaciones</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {chaptersList.slice(0, 6).map(chap => {
                    const parentSeries = seriesList.find(s => s.id === chap.series_id);
                    return (
                      <div 
                        key={chap.id} 
                        onClick={() => {
                          if (parentSeries) {
                            setSelectedSeries(parentSeries);
                            setSelectedChapter(chap);
                          }
                        }}
                        className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center space-x-4 cursor-pointer hover:border-cyan-500 transition shadow"
                      >
                        <div className="w-12 h-16 bg-slate-950 rounded flex-shrink-0 overflow-hidden border border-slate-800">
                          {parentSeries?.cover_url && <img src={parentSeries.cover_url} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-cyan-400 truncate">{parentSeries?.title}</p>
                          <p className="text-sm font-black text-white truncate">{chap.title}</p>
                          <p className="text-[10px] text-slate-500">Cap. #{chap.chapter_number}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* VISTA: BIBLIOTECA CON BUSCADOR Y FILTROS */
          <div className="space-y-6">
            <div className="flex items-center space-x-2 mb-2">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h2 className="text-2xl font-black text-white tracking-wide">Biblioteca de Obras</h2>
            </div>

            {/* PANEL DE BÚSQUEDA Y FILTROS */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-4 shadow-md">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-3 text-slate-500" />
                <input 
                  type="text"
                  placeholder="Buscar por título o sinopsis..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* FILTROS POR TIPO */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-400 mr-2 flex items-center space-x-1">
                  <Filter className="w-3.5 h-3.5" /> <span>Tipo:</span>
                </span>
                {['Todos', 'Manga', 'Manhwa', 'Manhua', 'Comic'].map(t => (
                  <button
                    key={t}
                    onClick={() => setSelectedTypeFilter(t)}
                    className={`px-3 py-1 rounded-md text-xs font-bold border transition ${selectedTypeFilter === t ? 'bg-cyan-600 text-white border-cyan-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* FILTROS POR ETIQUETA */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/60 pt-3">
                <span className="text-xs font-bold text-slate-400 mr-2 flex items-center space-x-1">
                  <Tag className="w-3.5 h-3.5" /> <span>Etiquetas:</span>
                </span>
                <button
                  onClick={() => setSelectedTagFilter('Todas')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold border transition ${selectedTagFilter === 'Todas' ? 'bg-purple-600 text-white border-purple-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'}`}
                >
                  Todas
                </button>
                {AVAILABLE_TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTagFilter(tag)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold border transition ${selectedTagFilter === tag ? 'bg-purple-600 text-white border-purple-400' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'}`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>

            {/* GRILLA DE RESULTADOS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
              {filteredSeries.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => setSelectedSeries(item)} 
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden cursor-pointer hover:border-cyan-500 hover:scale-[1.02] transition shadow-lg flex flex-col group"
                >
                  <div className="h-48 sm:h-64 bg-slate-950 overflow-hidden relative">
                    {item.cover_url ? (
                      <img src={item.cover_url} alt={item.title} className="w-full h-full object-cover group-hover:opacity-90 transition" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold text-xs">Sin Portada</div>
                    )}
                  </div>
                  <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded font-bold uppercase">{item.type}</span>
                      <h3 className="font-bold text-white text-sm sm:text-base truncate mt-2 group-hover:text-cyan-400 transition">{item.title}</h3>
                    </div>
                    <button className="w-full mt-3 bg-slate-800 group-hover:bg-cyan-600 text-cyan-400 group-hover:text-white font-bold py-2 rounded-lg text-xs border border-slate-700 transition">
                      Ver Detalles
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {filteredSeries.length === 0 && (
              <p className="text-center text-slate-500 text-sm py-10">No se encontraron obras con los filtros seleccionados.</p>
            )}
          </div>
        )}
      </main>

      {/* MODAL AUTH (LOGIN / REGISTRO / RECUPERAR CONTRASEÑA) */}
      {showAuth && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            {showNewPasswordForm ? (
              <>
                <div className="mb-4 border-b border-slate-800 pb-2">
                  <h3 className="text-xl font-bold text-white">Elige tu nueva contraseña</h3>
                </div>
                <form onSubmit={handleSetNewPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Nueva contraseña:</label>
                    <input
                      type="password"
                      value={newPasswordInput}
                      onChange={e => setNewPasswordInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={loading} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs border border-cyan-400">
                      {loading ? 'Guardando...' : 'Guardar contraseña'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                  <h3 className="text-xl font-bold text-white">
                    {authMode === 'login' ? 'Iniciar Sesión' : authMode === 'register' ? 'Crear Cuenta' : 'Recuperar Contraseña'}
                  </h3>
                  {authMode !== 'reset' && (
                    <button 
                      onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                      className="text-xs font-bold text-cyan-400 hover:underline"
                    >
                      {authMode === 'register' ? '¿Ya tienes cuenta? Inicia sesión' : '¿Sin cuenta? Regístrate'}
                    </button>
                  )}
                </div>
                
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  {authMode === 'register' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Correo electrónico:</label>
                      <input 
                        type="email" 
                        value={emailInput}
                        onChange={e => setEmailInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Nombre de usuario:</label>
                    <input 
                      type="text" 
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                      autoCapitalize="none"
                      required
                    />
                  </div>
                  {authMode !== 'reset' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Contraseña:</label>
                      <input 
                        type="password" 
                        value={passwordInput}
                        onChange={e => setPasswordInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500"
                        required
                        minLength={6}
                      />
                    </div>
                  )}
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => setAuthMode('reset')}
                      className="text-[11px] font-bold text-slate-400 hover:text-cyan-400 hover:underline"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  )}
                  {authMode === 'reset' && (
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="text-[11px] font-bold text-slate-400 hover:text-cyan-400 hover:underline"
                    >
                      ← Volver a iniciar sesión
                    </button>
                  )}
                  <div className="flex justify-end space-x-2 pt-2">
                    <button type="button" onClick={() => setShowAuth(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold">
                      Cancelar
                    </button>
                    <button type="submit" disabled={loading} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg text-xs border border-cyan-400">
                      {loading ? 'Procesando...' : authMode === 'login' ? 'Entrar' : authMode === 'register' ? 'Registrarse' : 'Enviar link de recuperación'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL CREAR USUARIO (ADMIN) */}
      {showCreateUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-purple-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center space-x-2 mb-4">
              <Shield className="w-5 h-5 text-purple-400" />
              <h3 className="text-xl font-bold text-white">Crear Usuario para Amigo</h3>
            </div>
            <form onSubmit={handleAdminCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Correo del amigo:</label>
                <input 
                  type="email" 
                  value={newUserEmail}
                  onChange={e => setNewUserEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Nombre de usuario (para iniciar sesión):</label>
                <input 
                  type="text" 
                  value={newUserUsername}
                  onChange={e => setNewUserUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Contraseña temporal:</label>
                <input 
                  type="password" 
                  value={newUserPassword}
                  onChange={e => setNewUserPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-purple-500"
                  minLength={6}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Rol / Permisos:</label>
                <select 
                  value={newUserRole} 
                  onChange={e => setNewUserRole(e.target.value as 'scan' | 'lector')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="scan">Scan (Puede Subir y Borrar)</option>
                  <option value="lector">Lector (Solo Leer y Descargar)</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowCreateUser(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs border border-purple-400">
                  {loading ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SUBIR CAPÍTULO */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-xl font-bold mb-4 text-white">Subir Contenido</h3>
            
            <div className="flex gap-2 mb-4 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button 
                type="button" 
                onClick={() => setIsNewSeries(true)} 
                className={`flex-1 py-2 text-xs font-bold rounded-md transition ${isNewSeries ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                + Crear Nueva Serie
              </button>
              <button 
                type="button" 
                onClick={() => setIsNewSeries(false)} 
                disabled={seriesList.length === 0} 
                className={`flex-1 py-2 text-xs font-bold rounded-md transition ${!isNewSeries ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Añadir a Serie Existente
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              {isNewSeries ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Título de la Obra (*):</label>
                    <input type="text" value={seriesTitle} onChange={e => setSeriesTitle(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white" required />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Tipo:</label>
                      <select value={seriesType} onChange={e => setSeriesType(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white">
                        <option value="Manga">Manga</option>
                        <option value="Manhwa">Manhwa</option>
                        <option value="Manhua">Manhua</option>
                        <option value="Comic">Comic</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">Portada:</label>
                      <input type="file" accept="image/*" onChange={e => setCoverFile(e.target.files?.[0] || null)} className="text-xs text-slate-400 w-full bg-slate-950 p-2 rounded border border-slate-800" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Etiquetas (Categorías):</label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto bg-slate-950 p-2 rounded-lg border border-slate-800">
                      {AVAILABLE_TAGS.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTagSelection(tag)}
                          className={`text-xs px-2 py-0.5 rounded border font-semibold transition ${seriesTags.includes(tag) ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Sinopsis:</label>
                    <textarea value={seriesSynopsis} onChange={e => setSeriesSynopsis(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white h-16" />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Selecciona la Obra (*):</label>
                  <select value={targetSeriesId} onChange={e => setTargetSeriesId(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white" required>
                    {seriesList.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                </div>
              )}

              <div className="border-t border-slate-800 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Capítulo N° (*):</label>
                    <input type="text" value={chapterNum} onChange={e => setChapterNum(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Título Capítulo:</label>
                    <input type="text" value={chapterTitle} onChange={e => setChapterTitle(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-sm text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Archivos (*):</label>
                  <input type="file" accept="image/*, .cbz, .zip" multiple onChange={e => setPagesFiles(e.target.files)} className="text-xs text-slate-400 w-full bg-slate-950 p-2 rounded border border-slate-800" required />
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                    • Varias imágenes sueltas = las páginas de <strong>un</strong> capítulo (el N° de arriba).<br />
                    • Un solo .cbz/.zip = <strong>un</strong> capítulo (se descomprime automáticamente).<br />
                    • Varios .cbz/.zip a la vez = <strong>un capítulo por cada archivo</strong>, numerado automáticamente (se intenta leer el número desde el nombre del archivo; si no se encuentra, se usa el N° de arriba como inicio).
                  </p>
                </div>
              </div>

              {loading && <p className="text-xs font-bold text-cyan-400 text-center animate-pulse">{uploadStatus}</p>}

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
                <button type="button" onClick={() => setShowUpload(false)} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-xs font-bold">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs border border-emerald-400">
                  {loading ? 'Guardando...' : 'Publicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}