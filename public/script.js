document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('consultationForm');
    const formMessage = document.getElementById('formMessage');
    const submitButton = form.querySelector('.btn-submit');

    // Set minimum date to today
    const dateInput = document.getElementById('preferredDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);

    // Style preferredContact like a placeholder when no value is selected
    const preferredContactSelect = document.getElementById('preferredContact');
    const updateContactColor = () => {
        preferredContactSelect.classList.toggle('has-value', preferredContactSelect.value !== '');
    };
    preferredContactSelect.addEventListener('change', updateContactColor);

    const step1 = document.getElementById('formStep1');
    const step2 = document.getElementById('formStep2');
    let formPhase = 1;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (formPhase === 1) {
            // Validate required fields in step 1 before advancing
            const requiredInputs = step1.querySelectorAll('[required]');
            for (const input of requiredInputs) {
                if (!input.checkValidity()) {
                    input.reportValidity();
                    return;
                }
            }
            // Transition to referral step
            step1.style.display = 'none';
            step2.style.display = 'block';
            step2.classList.add('step-fade-in');
            submitButton.textContent = 'Complete';
            formPhase = 2;
            return;
        }

        // Phase 2: submit the form
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';

        formMessage.className = 'form-message';
        formMessage.style.display = 'none';

        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            city: document.getElementById('city').value,
            state: document.getElementById('state').value,
            zip: document.getElementById('zip').value,
            preferredDate: document.getElementById('preferredDate').value,
            preferredTime: document.getElementById('preferredTime').value,
            preferredContact: document.getElementById('preferredContact').value,
            message: document.getElementById('message').value,
            referralFirstName: document.getElementById('referralFirstName').value,
            referralLastName: document.getElementById('referralLastName').value,
            referralPhone: document.getElementById('referralPhone').value
        };

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                formMessage.className = 'form-message success';
                formMessage.textContent = result.message || 'Thank you! Your consultation request has been submitted successfully. We will contact you soon.';
                formMessage.style.display = 'block';

                form.reset();
                updateContactColor();

                // Return to step 1
                step2.style.display = 'none';
                step2.classList.remove('step-fade-in');
                step1.style.display = 'block';
                formPhase = 1;
                submitButton.textContent = 'Schedule My Free Consultation';

                formMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                throw new Error(result.message || 'Failed to submit form');
            }
        } catch (error) {
            console.error('Form submission error:', error);
            formMessage.className = 'form-message error';
            formMessage.textContent = 'Sorry, there was an error submitting your request. Please try again or call us directly.';
            formMessage.style.display = 'block';
        } finally {
            submitButton.disabled = false;
            if (formPhase === 2) {
                submitButton.textContent = 'Complete';
            }
        }
    });

    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    phoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 10) {
            value = value.slice(0, 10);
        }
        if (value.length >= 6) {
            e.target.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
        } else if (value.length >= 3) {
            e.target.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
        } else {
            e.target.value = value;
        }
    });

    // Referral phone formatting
    const referralPhoneInput = document.getElementById('referralPhone');
    referralPhoneInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 10) value = value.slice(0, 10);
        if (value.length >= 6) {
            e.target.value = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
        } else if (value.length >= 3) {
            e.target.value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
        } else {
            e.target.value = value;
        }
    });

    // State input - auto uppercase
    const stateInput = document.getElementById('state');
    stateInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase();
    });

    // ZIP code - numbers only
    const zipInput = document.getElementById('zip');
    zipInput.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5);
    });
});
