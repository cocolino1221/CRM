# 🔒 Ghid Instalare Node.js și npm în Siguranță

## ✅ Instalare Sigură Node.js (include npm)

### Opțiunea 1: Homebrew (Recomandat pentru macOS)

```bash
# Instalează Homebrew dacă nu îl ai
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Instalează Node.js (include npm automat)
brew install node

# Verifică instalarea
node --version
npm --version
```

**De ce Homebrew?**
- ✅ Instalare oficială și sigură
- ✅ Actualizări ușoare
- ✅ Gestionare automată a dependențelor
- ✅ Nu necesită sudo pentru instalări

### Opțiunea 2: Site-ul Oficial (Cel mai sigur)

1. **Accesează site-ul oficial:**
   - **URL:** https://nodejs.org/
   - **IMPORTANT:** Verifică că URL-ul este exact `nodejs.org` (nu alte variante!)

2. **Descarcă versiunea LTS (Long Term Support):**
   - Click pe butonul verde "LTS" (recomandat)
   - Versiunea actuală: Node.js 20.x sau 22.x

3. **Instalează:**
   - Deschide fișierul `.pkg` descărcat
   - Urmează wizard-ul de instalare
   - npm este inclus automat

4. **Verifică:**
```bash
node --version  # Ar trebui să vezi v20.x.x sau v22.x.x
npm --version   # Ar trebui să vezi v10.x.x sau mai mare
```

### Opțiunea 3: nvm (Node Version Manager) - Pentru dezvoltatori

```bash
# Instalează nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reîncarcă terminalul sau rulează:
source ~/.zshrc

# Instalează Node.js LTS
nvm install --lts
nvm use --lts

# Verifică
node --version
npm --version
```

---

## 🛡️ Cum Să Eviti Pachete cu Probleme

### 1. Verifică Pachetele Înainte de Instalare

```bash
# Verifică vulnerabilitățile în proiect
npm audit

# Rezolvă automat vulnerabilitățile minore
npm audit fix

# Rezolvă și vulnerabilitățile majore (cu atenție!)
npm audit fix --force
```

### 2. Instalează Doar Pachete Oficiale

**✅ BUNE:**
- Pachete de la organizații cunoscute: `@nestjs/*`, `@slack/*`, `@google/*`
- Pachete populare cu multe descărcări: `axios`, `react`, `express`
- Verifică numărul de descărcări pe npmjs.com

**❌ EVITĂ:**
- Pachete cu nume suspecte sau typo-squatting (ex: `axois` în loc de `axios`)
- Pachete cu puține descărcări și fără documentație
- Pachete care cer permisiuni ciudate

### 3. Verifică Pachetele Înainte de `npm install`

```bash
# Verifică informații despre un pachet
npm info <nume-pachet>

# Verifică dependențele
npm ls <nume-pachet>

# Verifică vulnerabilitățile pentru un pachet specific
npm audit <nume-pachet>
```

### 4. Folosește `package-lock.json`

Proiectul tău are deja `package-lock.json` - **NU șterge acest fișier!**
- Asigură că instalezi exact aceleași versiuni testate
- Previne instalarea accidentală a versiunilor cu vulnerabilități

---

## 🔍 Verificare Securitate pentru Proiectul Tău

După ce instalezi Node.js, verifică proiectul:

```bash
cd /Users/constantinpristavita/Desktop/CRM

# Verifică vulnerabilitățile
npm audit

# Dacă găsește probleme, încearcă să le rezolvi:
npm audit fix

# Verifică din nou
npm audit
```

---

## ✅ Checklist Securitate

- [ ] Node.js instalat de la sursă oficială (nodejs.org sau Homebrew)
- [ ] Versiunea Node.js este LTS (20.x sau 22.x)
- [ ] `npm audit` nu arată vulnerabilități critice
- [ ] `package-lock.json` este prezent și actualizat
- [ ] Nu instalezi pachete de la surse necunoscute
- [ ] Actualizezi periodic: `npm update`

---

## 🚨 Semne de Alarmă

**NU instala dacă:**
- ❌ Site-ul nu este `nodejs.org` (verifică URL-ul!)
- ❌ Fișierul descărcat are extensie `.exe` pe macOS (ar trebui `.pkg`)
- ❌ Se cere să instalezi "Node.js Pro" sau versiuni plătite (Node.js este gratuit!)
- ❌ Se cere parola de admin pentru instalări simple
- ❌ Pachetul npm are puține descărcări (< 1000/săptămână)

---

## 📚 Resurse Oficiale

- **Node.js oficial:** https://nodejs.org/
- **npm oficial:** https://www.npmjs.com/
- **Security advisories:** https://github.com/nodejs/security-wg
- **npm security:** https://docs.npmjs.com/security

---

## 🎯 Pași Rapizi pentru Tine

1. **Instalează Node.js:**
```bash
brew install node
# SAU descarcă de la https://nodejs.org/
```

2. **Verifică:**
```bash
node --version  # Trebuie să fie v20.x.x sau mai nou
npm --version   # Trebuie să fie v10.x.x sau mai nou
```

3. **Instalează dependențele proiectului:**
```bash
cd /Users/constantinpristavita/Desktop/CRM
npm install
```

4. **Verifică securitatea:**
```bash
npm audit
```

5. **Pornește aplicația:**
```bash
npm run dev
```

---

**Node.js și npm sunt sigure dacă le instalezi de la surse oficiale!** ✅



