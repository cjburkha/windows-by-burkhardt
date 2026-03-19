document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('consultationForm');
    const formMessage = document.getElementById('formMessage');
    const submitButton = form.querySelector('.btn-submit');

    // Set minimum date to today
    const dateInput = document.getElementById('preferredDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Disable submit button
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';

        // Clear previous messages
        formMessage.className = 'form-message';
        formMessage.style.display = 'none';

        // Gather form data
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
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Success
                formMessage.className = 'form-message success';
                formMessage.textContent = result.message || 'Thank you! Your consultation request has been submitted successfully. We will contact you soon.';
                formMessage.style.display = 'block';

                // Reset form
                form.reset();

                // Scroll to message
                formMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                // Error from server
                throw new Error(result.message || 'Failed to submit form');
            }
        } catch (error) {
            console.error('Form submission error:', error);
            formMessage.className = 'form-message error';
            formMessage.textContent = 'Sorry, there was an error submitting your request. Please try again or call us directly.';
            formMessage.style.display = 'block';
        } finally {
            // Re-enable submit button
            submitButton.disabled = false;
            submitButton.textContent = 'Schedule Consultation';
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
