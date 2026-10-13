// Создаем память для наших шагов. В начале их ноль.
let steps = 0;

// Находим нашу кнопку и цифру на экране
const button = document.getElementById('addStepButton');
const display = document.getElementById('stepCount');

// Даем кнопке команду: "Когда на тебя нажимают, делай следующее"
button.addEventListener('click', function() {
    // Добавляем к текущим шагам еще 500
    steps = steps + 500;
    
    // Показываем новое число на экране
    display.textContent = steps;
});