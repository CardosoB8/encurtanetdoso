document.addEventListener('DOMContentLoaded', () => {
    // Configurações
    const TOTAL_STEPS = 6;
    const COUNTDOWN_TIME = 15; // Segundos
    
    // Elementos DOM
    const countdownEl = document.getElementById('countdown');
    const progressBar = document.getElementById('progressBar');
    const nextBtn = document.getElementById('nextStepBtn');
    const titleEl = document.querySelector('.countdown-card h1'); // Para alterar o texto "1/3"
    
    // Obtém parâmetros da URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    // Detecta o passo atual baseado na URL (ex: /page2 -> 2)
    const pathStep = window.location.pathname.match(/page(\d+)/);
    const currentStep = pathStep ? parseInt(pathStep[1]) : 1;

    // Atualiza visualmente o título (Ex: "Processando... 2/6")
    if (titleEl) {
        titleEl.innerHTML = `<i class="fas fa-hourglass-half"></i> Processando o link... ${currentStep}/${TOTAL_STEPS}`;
    }

    if (!token) {
        alert("Token inválido.");
        window.location.href = '/';
        return;
    }

    let timeLeft = COUNTDOWN_TIME;
    let timerInterval;
    let isTabActive = true;

    // *** SEGURANÇA FRONTEND: DETECÇÃO DE ABA ***
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            isTabActive = false;
            document.title = "🚨 Volte aqui! O tempo parou.";
        } else {
            isTabActive = true;
            document.title = "Processando... | Mr Doso";
        }
    });

    function startTimer() {
        // Inicializa botão desativado
        nextBtn.disabled = true;
        nextBtn.style.opacity = "0.5";
        nextBtn.style.cursor = "not-allowed";

        timerInterval = setInterval(() => {
            // Só desconta o tempo se a aba estiver ativa!
            if (isTabActive && timeLeft > 0) {
                timeLeft--;
                countdownEl.textContent = timeLeft;
                
                // Atualiza barra de progresso
                const progressPercentage = ((COUNTDOWN_TIME - timeLeft) / COUNTDOWN_TIME) * 100;
                progressBar.style.width = `${progressPercentage}%`;
            } else if (timeLeft <= 0) {
                clearInterval(timerInterval);
                enableButton();
            }
        }, 1000);
    }

    function enableButton() {
        nextBtn.disabled = false;
        nextBtn.style.opacity = "1";
        nextBtn.style.cursor = "pointer";
        nextBtn.innerHTML = `<i class="fas fa-check"></i> Continuar (${currentStep}/${TOTAL_STEPS})`;
        
        // Animação para chamar atenção
        nextBtn.classList.add('pulse-animation');
    }

    // Lógica do Clique
    nextBtn.addEventListener('click', async () => {
        if (timeLeft > 0) return;

        nextBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Validando...`;
        
        try {
            // Chama nossa API segura
            const response = await fetch(`/api/next-step?token=${token}&currentStep=${currentStep}`);
            const data = await response.json();

            if (response.ok && data.redirect) {
                window.location.href = data.redirect;
            } else {
                // Se o servidor reclamar (ex: foi muito rápido)
                if (data.resetTimer) {
                    showAlert("Segurança", data.error);
                    timeLeft = 5; // Adiciona penalidade de 5 segundos
                    startTimer();
                } else {
                    showAlert("Erro", data.error || "Erro desconhecido.");
                    if (data.redirect) setTimeout(() => window.location.href = data.redirect, 2000);
                }
            }
        } catch (error) {
            console.error(error);
            showAlert("Erro", "Falha na conexão com o servidor.");
        }
    });

    // Funções Auxiliares
    function showAlert(title, msg) {
        const overlay = document.getElementById('customAlertOverlay');
        document.getElementById('customAlertTitle').textContent = title;
        document.getElementById('customAlertMessage').textContent = msg;
        overlay.classList.add('active');
        
        document.getElementById('customAlertCloseBtn').onclick = () => {
            overlay.classList.remove('active');
        };
    }

    // Inicia tudo
    startTimer();
});