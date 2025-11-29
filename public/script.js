document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    const pathStepMatch = window.location.pathname.match(/page(\d+)/);
    const currentStep = pathStepMatch ? parseInt(pathStepMatch[1]) : 1;

    const COUNTDOWN_TIME = 15;
    
    const countdownEl = document.getElementById('countdown');
    const progressBar = document.getElementById('progressBar');
    const nextBtn = document.getElementById('nextStepBtn');
    const titleEl = document.querySelector('.countdown-card h1');

    let TOTAL_STEPS = 3; // Valor inicial, será atualizado
    let timeLeft = COUNTDOWN_TIME;
    let timerInterval;
    let isTabActive = true;

    if (!token) {
        showAlert("Erro", "Sessão inválida.");
        return;
    }

    // Buscar o total REAL de etapas do servidor
    async function fetchTotalSteps() {
        try {
            const response = await fetch(`/api/get-total?token=${token}`);
            const data = await response.json();
            
            if (response.ok) {
                TOTAL_STEPS = data.total;
                updateTitle();
            } else {
                console.error('Erro ao buscar total:', data.error);
            }
        } catch (error) {
            console.error('Erro ao buscar total:', error);
        }
    }

    function updateTitle() {
        if (titleEl) {
            titleEl.innerHTML = `<i class="fas fa-hourglass-half"></i> Processando link... ${currentStep}/${TOTAL_STEPS}`;
        }
    }

    // Pausa se sair da aba
    document.addEventListener("visibilitychange", () => {
        isTabActive = !document.hidden;
        document.title = document.hidden ? "🚨 O tempo parou!" : "Processando... | Mr Doso";
    });

    function startTimer() {
        nextBtn.disabled = true;
        updateTitle(); // Atualiza título com valor inicial
        
        timerInterval = setInterval(() => {
            if (isTabActive && timeLeft > 0) {
                timeLeft--;
                if(countdownEl) countdownEl.textContent = timeLeft;
                
                const progressPercentage = ((COUNTDOWN_TIME - timeLeft) / COUNTDOWN_TIME) * 100;
                if(progressBar) progressBar.style.width = `${progressPercentage}%`;
            } else if (timeLeft <= 0) {
                clearInterval(timerInterval);
                enableButton();
            }
        }, 1000);
    }

    function enableButton() {
        nextBtn.disabled = false;
        if (currentStep >= TOTAL_STEPS) {
             nextBtn.innerHTML = `<i class="fas fa-external-link-alt"></i> Acessar Link Final`;
        } else {
             nextBtn.innerHTML = `<i class="fas fa-arrow-right"></i> Ir para Etapa ${currentStep + 1}`;
        }
        nextBtn.classList.add('pulse-animation');
    }

    nextBtn.addEventListener('click', async () => {
        if (timeLeft > 0) return;

        nextBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Validando...`;
        
        try {
            const response = await fetch(`/api/next-step?token=${token}&currentStep=${currentStep}`);
            const data = await response.json();

            if (response.ok && data.redirect) {
                window.location.href = data.redirect;
            } else {
                if (data.resetTimer) {
                    showAlert("Ops!", data.error);
                    // Reinicia o timer com o tempo restante calculado pelo servidor
                    if (data.remainingTime) {
                        timeLeft = Math.ceil(data.remainingTime / 1000);
                    } else {
                        timeLeft = 5;
                    }
                    startTimer();
                } else {
                    showAlert("Erro", data.error || "Erro desconhecido.");
                    if (data.redirect) setTimeout(() => window.location.href = data.redirect, 2000);
                }
            }
        } catch (error) {
            console.error(error);
            showAlert("Erro", "Falha na conexão.");
        }
    });

    function showAlert(title, msg) {
        const overlay = document.getElementById('customAlertOverlay');
        const t = document.getElementById('customAlertTitle');
        const m = document.getElementById('customAlertMessage');
        const c = document.getElementById('customAlertCloseBtn');

        if(overlay && t && m && c) {
            t.textContent = title;
            m.textContent = msg;
            overlay.classList.add('active');
            c.onclick = () => overlay.classList.remove('active');
        } else {
            alert(`${title}: ${msg}`);
        }
    }

    // Inicialização
    fetchTotalSteps(); // Busca o total real do servidor
    startTimer();
});