import React from 'react';
import { COLORS } from '../lib/utils';

interface LoginViewProps {
  authTab: 'login' | 'signup' | 'recover';
  setAuthTab: (tab: 'login' | 'signup' | 'recover') => void;
  lEmail: string;
  setLEmail: (val: string) => void;
  lPass: string;
  setLPass: (val: string) => void;
  sName: string;
  setSName: (val: string) => void;
  sRole: string;
  setSRole: (val: string) => void;
  sEmail: string;
  setSEmail: (val: string) => void;
  sPass: string;
  setSPass: (val: string) => void;
  sColor: string;
  setSColor: (val: string) => void;
  rEmail: string;
  setREmail: (val: string) => void;
  rName: string;
  setRName: (val: string) => void;
  rPass: string;
  setRPass: (val: string) => void;
  authErr: string;
  setAuthErr: (val: string) => void;
  authLoading2: boolean;
  handleLogin: () => void;
  handleSignup: () => void;
  handleRecover: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  authTab,
  setAuthTab,
  lEmail,
  setLEmail,
  lPass,
  setLPass,
  sName,
  setSName,
  sRole,
  setSRole,
  sEmail,
  setSEmail,
  sPass,
  setSPass,
  sColor,
  setSColor,
  rEmail,
  setREmail,
  rName,
  setRName,
  rPass,
  setRPass,
  authErr,
  setAuthErr,
  authLoading2,
  handleLogin,
  handleSignup,
  handleRecover,
}) => {
  return (
    <main className="min-h-screen flex flex-col md:flex-row relative overflow-hidden bg-background text-on-surface font-body selection:bg-secondary selection:text-on-secondary">
      {/* Left side (Visual Impact) */}
      <div className="hidden md:flex flex-col justify-between w-1/2 lg:w-3/5 p-12 lg:p-20 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            alt="Productivity focus background" 
            className="w-full h-full object-cover opacity-20 mix-blend-luminosity" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBrYb69Qgp8v1o2HGm5f7WlVKNXqMtE4V0X7hzVty9trsYY_m2DKzzEtGQUrNyPT3vwMb28aUjtOZfW7ijMUYdQ9e4j_lnVjqylhR7EAT91tEERqqA-Ydsc7H2QDAEVynsESkllvbjLgehKQSSkYHsotypiJxiXVob6AEuzeuIX1LPdF7HvD1yXFOZMCUAjiev8e9Lh20RbvDSy5cKBeQbGx1bcNihKHJ3kYp3HXKhgZ2vtzGBnfItuDzb8wiH3zWEJqQDSlHUlUX4a"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-background via-surface/90 to-transparent"></div>
        </div>
        
        {/* Redone Logo Section */}
        <div className="relative z-10 space-y-8">
          <div className="brand-group flex flex-col">
            <div className="flex items-center gap-6 mb-1">
              {/* SVG Box Icon with Dollar Sign */}
              <div className="relative w-16 h-16 flex-shrink-0">
                <svg className="w-full h-full drop-shadow-2xl" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                  <path d="M50 90 L90 75 L90 45 L50 60 Z" fill="#001B5E"></path>
                  <path d="M50 90 L10 75 L10 45 L50 60 Z" fill="#001B5E"></path>
                  <path d="M10 45 L50 30 L90 45 L50 60 Z" fill="#000d2e"></path>
                  <text fill="white" fontFamily="sans-serif" fontSize="18" fontWeight="900" transform="matrix(1, 0.35, 0, 1, 18, 68)">DC</text>
                  <text fill="#40e56c" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))" fontFamily="sans-serif" fontSize="42" fontWeight="900" textAnchor="middle" x="50" y="48">$</text>
                  <path d="M10 45 L50 60 L90 45" fill="none" stroke="#ffffff22" strokeWidth="1.5"></path>
                  <path d="M50 60 V90" fill="none" stroke="#ffffff22" strokeWidth="1.5"></path>
                </svg>
              </div>
              <div className="flex flex-col">
                <div className="text-4xl lg:text-5xl font-headline font-extrabold tracking-tight leading-none">
                  <span className="text-primary">Dinheiro em</span>
                  <span className="text-secondary block lg:inline ml-0 lg:ml-2">Caixa</span>
                </div>
                <span className="text-on-surface-variant font-body text-sm lg:text-base uppercase tracking-[0.2em] font-semibold mt-2">Terceirização Financeira</span>
              </div>
            </div>
            <div className="pl-24">
              <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tighter text-primary/60 italic">Nexa Calendar</h1>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-2xl">
          <p className="font-label text-secondary uppercase tracking-[0.3em] text-xs mb-4 font-bold">Produtividade Inteligente</p>
          <h2 className="font-headline text-6xl lg:text-8xl font-bold leading-[0.95] tracking-tighter mb-8">
            Sua agenda inteligente <br/>
            <span className="text-secondary">de tarefas</span>
          </h2>
          <p className="text-on-surface-variant text-xl max-w-lg leading-relaxed font-light">
            A plataforma definitiva para gerenciar sua rotina com precisão. Domine suas tarefas com a agilidade que seu dia exige.
          </p>
        </div>

        <div className="relative z-10 flex gap-12 items-center">
          <div className="flex flex-col">
            <span className="text-primary font-bold text-3xl">99.9%</span>
            <span className="text-on-surface-variant text-xs uppercase tracking-widest font-bold">Uptime Ledger</span>
          </div>
          <div className="w-px h-12 bg-outline-variant/30"></div>
          <div className="flex flex-col">
            <span className="text-primary font-bold text-3xl">AES-256</span>
            <span className="text-on-surface-variant text-xs uppercase tracking-widest font-bold">Encryption</span>
          </div>
        </div>
      </div>

      {/* Right side (Login/Signup Form) */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-24 bg-surface-container-low relative overflow-y-auto">
        <div className="w-full max-w-md space-y-8 relative z-10 py-8">
          <header className="space-y-2">
            <div className="flex gap-8 mb-8 border-b border-outline-variant/10">
              <button 
                className={`pb-4 text-sm font-bold tracking-widest uppercase border-b-2 transition-all ${authTab === 'login' ? 'border-secondary text-on-surface' : 'border-transparent text-on-surface-variant hover:text-primary'}`}
                onClick={() => { setAuthTab('login'); setAuthErr(''); }}
              >
                Entrar
              </button>
              <button 
                className={`pb-4 text-sm font-bold tracking-widest uppercase border-b-2 transition-all ${authTab === 'signup' ? 'border-secondary text-on-surface' : 'border-transparent text-on-surface-variant hover:text-primary'}`}
                onClick={() => { setAuthTab('signup'); setAuthErr(''); }}
              >
                Cadastrar
              </button>
            </div>
            <h3 className="font-headline text-3xl font-bold mt-4">
              {authTab === 'login' ? 'Seja bem-vindo' : authTab === 'signup' ? 'Crie sua conta' : 'Recuperar Senha'}
            </h3>
            <p className="text-on-surface-variant text-sm font-body">
              {authTab === 'login' 
                ? 'Identifique-se para acessar seu ambiente de trabalho.' 
                : authTab === 'signup' 
                ? 'Preencha os dados abaixo para começar sua jornada.' 
                : 'Informe seu e-mail e nome completo para redefinir.'}
            </p>
          </header>

          {authErr && (
            <div className="bg-error-container text-on-error-container p-4 rounded-xl text-sm font-bold border border-error/20 animate-pulse">
              {authErr}
            </div>
          )}

          <div className="space-y-6">
            {authTab === 'login' ? (
              <>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1" htmlFor="email">E-MAIL</label>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      id="email" 
                      placeholder="seu@email.com" 
                      type="email"
                      value={lEmail}
                      onChange={(e) => setLEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest" htmlFor="password">SENHA</label>
                    <button type="button" className="text-[10px] font-bold text-primary uppercase tracking-wider hover:text-secondary transition-colors border-none bg-transparent cursor-pointer" onClick={() => { setAuthTab('recover'); setAuthErr(''); }}>Esqueceu a senha?</button>
                  </div>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      id="password" 
                      placeholder="••••••••" 
                      type="password"
                      value={lPass}
                      onChange={(e) => setLPass(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>
                <button 
                  className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-extrabold py-5 rounded-xl text-lg hover:shadow-[0_10px_40px_-10px_rgba(182,196,255,0.4)] active:scale-[0.98] transition-all flex justify-center items-center gap-2 group disabled:opacity-50"
                  type="button"
                  onClick={handleLogin}
                  disabled={authLoading2}
                >
                  {authLoading2 ? 'Entrando...' : 'Entrar'}
                  <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </button>
              </>
            ) : authTab === 'signup' ? (
              /* SIGNUP FORM */
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1">NOME COMPLETO</label>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      placeholder="Seu nome" 
                      value={sName}
                      onChange={(e) => setSName(e.target.value)}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1">CARGO / FUNÇÃO</label>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      placeholder="Ex: Analista" 
                      value={sRole}
                      onChange={(e) => setSRole(e.target.value)}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1">E-MAIL</label>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      type="email"
                      placeholder="seu@email.com" 
                      value={sEmail}
                      onChange={(e) => setSEmail(e.target.value)}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1">SENHA (MÍN. 4 CARACTERES)</label>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      type="password"
                      placeholder="••••••••" 
                      value={sPass}
                      onChange={(e) => setSPass(e.target.value)}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1">COR DO AVATAR</label>
                  <div className="flex flex-wrap gap-3 justify-center bg-surface-container-highest p-4 rounded-xl">
                    {COLORS.map(c => (
                      <button 
                        key={c} 
                        className={`w-9 h-9 rounded-full border-4 transition-all ${sColor === c ? 'border-on-surface scale-110 shadow-lg' : 'border-transparent hover:scale-105'}`} 
                        style={{ background: c }} 
                        onClick={() => setSColor(c)} 
                        type="button"
                      />
                    ))}
                  </div>
                </div>

                <button 
                  className="w-full bg-gradient-to-r from-secondary to-on-secondary-container text-on-secondary font-headline font-extrabold py-5 rounded-xl text-lg hover:shadow-[0_10px_40px_-10px_rgba(64,229,108,0.4)] active:scale-[0.98] transition-all flex justify-center items-center gap-2 group disabled:opacity-50 mt-6"
                  type="button"
                  onClick={handleSignup}
                  disabled={authLoading2}
                >
                  {authLoading2 ? 'Cadastrando...' : 'Criar minha conta'}
                  <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">person_add</span>
                </button>
              </div>
            ) : (
              /* RECOVER FORM */
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1">E-MAIL</label>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      type="email"
                      placeholder="seu@email.com" 
                      value={rEmail}
                      onChange={(e) => setREmail(e.target.value)}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1">NOME COMPLETO</label>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      placeholder="Igual ao cadastrado" 
                      value={rName}
                      onChange={(e) => setRName(e.target.value)}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-widest ml-1">NOVA SENHA</label>
                  <div className="relative group">
                    <input 
                      className="w-full bg-surface-container-highest text-on-surface border-none rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:bg-primary-container transition-all placeholder:text-outline/50 new-login-input" 
                      type="password"
                      placeholder="••••••••" 
                      value={rPass}
                      onChange={(e) => setRPass(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRecover()}
                    />
                    <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-secondary transition-all duration-300 group-focus-within:w-full blur-[0.5px]"></div>
                  </div>
                </div>

                <button 
                  className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-extrabold py-5 rounded-xl text-lg hover:shadow-[0_10px_40px_-10px_rgba(182,196,255,0.4)] active:scale-[0.98] transition-all flex justify-center items-center gap-2 group disabled:opacity-50 mt-6"
                  type="button"
                  onClick={handleRecover}
                  disabled={authLoading2}
                >
                  {authLoading2 ? 'Redefinindo...' : 'Redefinir Senha'}
                  <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">lock_reset</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-6 pt-4">
            <p className="text-sm text-on-surface-variant">
              {authTab === 'login' ? (
                <>
                  Ainda não possui uma conta? 
                  <button className="text-secondary font-bold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer" onClick={() => setAuthTab('signup')}>Abra sua conta agora</button>
                </>
              ) : authTab === 'signup' ? (
                <>
                  Já tem uma conta? 
                  <button className="text-primary font-bold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer" onClick={() => setAuthTab('login')}>Fazer login</button>
                </>
              ) : (
                <>
                  Lembrou a senha? 
                  <button className="text-primary font-bold hover:underline underline-offset-4 ml-1 bg-transparent border-none cursor-pointer" onClick={() => setAuthTab('login')}>Voltar ao login</button>
                </>
              )}
            </p>
          </div>

          <footer className="pt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 border-t border-outline-variant/10">
            <a className="text-[10px] font-bold uppercase tracking-widest text-outline hover:text-on-surface transition-colors no-underline" href="#">PRIVACIDADE</a>
            <a className="text-[10px] font-bold uppercase tracking-widest text-outline hover:text-on-surface transition-colors no-underline" href="#">TERMOS</a>
            <a className="text-[10px] font-bold uppercase tracking-widest text-outline hover:text-on-surface transition-colors no-underline" href="#">SUPORTE</a>
          </footer>
        </div>
      </div>

      {/* Background Accents */}
      <div className="absolute top-0 -left-24 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-[150px] pointer-events-none"></div>
    </main>
  );
};
